import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ValidateMediaDto {
  @IsEnum(['image', 'video', 'gif', 'document'])
  kind: 'image' | 'video' | 'gif' | 'document';

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;
}

export class ValidateContentDto {
  // Bounded so a caller cannot force unbounded work in the validator; the
  // largest supported platform limit is well under this.
  @IsString()
  @MaxLength(200000)
  text: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  platforms: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ValidateMediaDto)
  media?: ValidateMediaDto[];
}
