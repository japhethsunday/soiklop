import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
} from '@nestjs/common';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { Request, Response } from 'express';
import OpenAI from 'openai';
import {
  getOpenAiApiKey,
  getOpenAiBaseUrl,
  getOpenAiModel,
  isOpenAiConfigured,
} from '@gitroom/nestjs-libraries/ai/openai.compatible';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

export type ChannelsContext = {
  integrations: string;
  organization: string;
  ui: string;
};

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService
  ) {}

  private static isAiConfigured(): boolean {
    return isOpenAiConfigured();
  }

  /**
   * The adapter defaults to a client pointed at OpenAI's own endpoint, so it
   * has to be given one built from configuration or a key issued by an
   * OpenAI-compatible gateway is sent to the wrong host.
   */
  private static serviceAdapter() {
    const client = new OpenAI({
      apiKey: getOpenAiApiKey(),
      baseURL: getOpenAiBaseUrl(),
    });

    return new OpenAIAdapter({
      // @copilotkit/runtime bundles its own older `openai` typings, so a
      // client built from the root package is rejected structurally even
      // though it is the very client the adapter calls at runtime. The cast
      // targets the adapter's own parameter type rather than `any`, so a
      // genuine shape change would still be caught here.
      openai: client as unknown as NonNullable<
        ConstructorParameters<typeof OpenAIAdapter>[0]
      >['openai'],
      model: getOpenAiModel('gpt-4.1'),
    });
  }

  /**
   * Ends the request with an explicit error when no AI provider is configured.
   *
   * These handlers previously logged a warning and returned without writing
   * anything to the response, leaving the HTTP request open until the browser
   * gave up around two minutes later. The user saw the assistant hang with no
   * explanation, and the access log recorded a 499 rather than a fault.
   */
  private static respondAiNotConfigured(res: Response) {
    Logger.warn(
      'AI request rejected: no AI provider is configured (set OPENAI_API_KEY).'
    );

    return res.status(503).json({
      error: 'ai_not_configured',
      message:
        'No AI provider is configured for this instance. Set an AI provider ' +
        'API key to enable the assistant.',
    });
  }
  @Post('/chat')
  chatAgent(@Req() req: Request, @Res() res: Response) {
    if (!CopilotController.isAiConfigured()) {
      return CopilotController.respondAiNotConfigured(res);
    }

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      runtime: new CopilotRuntime(),
      serviceAdapter: CopilotController.serviceAdapter(),
    });

    return copilotRuntimeHandler(req, res);
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    if (!CopilotController.isAiConfigured()) {
      return CopilotController.respondAiNotConfigured(res);
    }
    const mastra = await this._mastraService.mastra();
    const requestContext = new RequestContext<ChannelsContext>();
    requestContext.set(
      'integrations',
      req?.body?.variables?.properties?.integrations || []
    );

    requestContext.set('organization', JSON.stringify(organization));
    requestContext.set('ui', 'true');

    const agents = MastraAgent.getLocalAgents({
      resourceId: organization.id,
      mastra,
      requestContext: requestContext as any,
    });

    const runtime = new CopilotRuntime({
      agents,
    });

    const copilotRuntimeHandler = copilotRuntimeNextJSAppRouterEndpoint({
      endpoint: '/copilot/agent',
      runtime,
      // properties: req.body.variables.properties,
      serviceAdapter: CopilotController.serviceAdapter(),
    });

    return copilotRuntimeHandler.handleRequest(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      Logger.warn(`Could not recall messages for thread ${threadId}: ${err}`);
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    const list = await memory.listThreads({
      filter: { resourceId: organization.id },
      perPage: 100000,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }
}
