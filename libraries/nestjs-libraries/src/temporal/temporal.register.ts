import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { Connection } from '@temporalio/client';

@Injectable()
export class TemporalRegister implements OnModuleInit {
  constructor(private _client: TemporalService) {}

  private readonly _logger = new Logger(TemporalRegister.name);

  async onModuleInit(): Promise<void> {
    if (process.env.TEMPORAL_TLS === 'true') {
      return;
    }

    // Registering search attributes is start-up convenience, not a
    // precondition for serving HTTP. Letting it throw here aborts
    // NestApplication.init(), so app.listen() never runs and the whole API is
    // unreachable whenever Temporal is down -- authentication, the dashboard
    // and analytics included, none of which need Temporal at all.
    //
    // Failing soft here does not paper over a broken publishing pipeline: the
    // scheduling and publishing paths use the Temporal client directly and
    // still surface their own errors, so a post can never be reported as
    // published while Temporal is unreachable.
    try {
      await this.registerSearchAttributes();
    } catch (error) {
      this._logger.error(
        'Could not register Temporal search attributes; the API will start ' +
          'but scheduling and publishing will fail until Temporal is ' +
          `reachable at ${process.env.TEMPORAL_ADDRESS || 'the configured address'}.`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  private async registerSearchAttributes(): Promise<void> {
    const connection = this._client?.client?.getRawClient()
      ?.connection as Connection;

    const { customAttributes } =
      await connection.operatorService.listSearchAttributes({
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
      });

    const neededAttribute = ['organizationId', 'postId'];
    const missingAttributes = neededAttribute.filter(
      (attr) => !customAttributes[attr]
    );

    if (missingAttributes.length > 0) {
      await connection.operatorService.addSearchAttributes({
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
        searchAttributes: missingAttributes.reduce((all, current) => {
          // @ts-ignore
          all[current] = 1;
          return all;
        }, {}),
      });
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [TemporalRegister],
  get exports() {
    return this.providers;
  },
})
export class TemporalRegisterMissingSearchAttributesModule {}
