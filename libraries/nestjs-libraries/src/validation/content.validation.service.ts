import { Injectable } from '@nestjs/common';
import {
  getPlatformRules,
  MediaKind,
  PlatformRules,
} from '@gitroom/nestjs-libraries/validation/platform.rules';

export type IssueSeverity = 'error' | 'warning';

export type IssueCode =
  | 'unknown-platform'
  | 'text-too-long'
  | 'text-required'
  | 'too-many-hashtags'
  | 'too-many-links'
  | 'media-required'
  | 'too-many-attachments'
  | 'unsupported-media-kind'
  | 'mixed-media-kinds'
  | 'media-too-large'
  | 'video-too-short'
  | 'video-too-long'
  | 'aspect-ratio-out-of-range';

export interface ValidationIssue {
  platform: string;
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
}

export interface ValidationMedia {
  kind: MediaKind;
  /** File size in bytes, when known. Unknown sizes are not size-checked. */
  sizeBytes?: number;
  /** Video duration in seconds, when known. */
  durationSeconds?: number;
  width?: number;
  height?: number;
}

export interface ContentToValidate {
  text: string;
  media?: ValidationMedia[];
}

export interface PlatformValidationResult {
  platform: string;
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  byPlatform: Record<string, PlatformValidationResult>;
}

/**
 * Resolves the live character limit for a platform. The publishing path passes
 * a resolver backed by the provider's `maxLength()` so per-account tiers (X
 * premium) and per-post-type limits (X articles) are honoured; callers without
 * provider access omit it and fall back to the documented table value.
 */
export type TextLimitResolver = (identifier: string) => number | undefined;

// Matches "#word" only when the # starts a token, so "C#" and URL fragments
// such as "example.com/page#section" are not miscounted as hashtags.
const HASHTAG_PATTERN = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
const LINK_PATTERN = /https?:\/\/[^\s<>"']+/gi;

@Injectable()
export class ContentValidationService {
  /**
   * Validates one piece of content against every target platform.
   *
   * Each platform is judged independently: content that fits X is not assumed
   * to fit Instagram. An unknown platform yields an explicit `unknown-platform`
   * error rather than a silent pass, so a missing ruleset can never be mistaken
   * for a clean bill of health.
   */
  validate(
    content: ContentToValidate,
    platforms: string[],
    resolveTextLimit?: TextLimitResolver
  ): ValidationResult {
    const byPlatform: Record<string, PlatformValidationResult> = {};

    for (const platform of platforms) {
      const issues = this.validateOne(content, platform, resolveTextLimit);
      byPlatform[platform] = {
        platform,
        valid: !issues.some((issue) => issue.severity === 'error'),
        issues,
      };
    }

    const issues = Object.values(byPlatform).flatMap((r) => r.issues);

    return {
      valid: Object.values(byPlatform).every((r) => r.valid),
      issues,
      byPlatform,
    };
  }

  private validateOne(
    content: ContentToValidate,
    platform: string,
    resolveTextLimit?: TextLimitResolver
  ): ValidationIssue[] {
    const rules = getPlatformRules(platform);

    if (!rules) {
      return [
        {
          platform,
          code: 'unknown-platform',
          severity: 'error',
          message:
            `No publishing rules are defined for "${platform}", so this ` +
            `content cannot be validated. Refusing to assume it is valid.`,
        },
      ];
    }

    return [
      ...this.validateText(content, rules, resolveTextLimit),
      ...this.validateMedia(content, rules),
    ];
  }

  private validateText(
    content: ContentToValidate,
    rules: PlatformRules,
    resolveTextLimit?: TextLimitResolver
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const platform = rules.identifier;
    const text = content.text ?? '';
    const trimmed = text.trim();

    const limit = resolveTextLimit?.(platform) ?? rules.textLimit;

    // Count by code point, not UTF-16 unit: an emoji is one character to the
    // user and `"👍".length` of 2 would reject posts the platform accepts.
    const length = [...text].length;

    if (length > limit) {
      issues.push({
        platform,
        code: 'text-too-long',
        severity: 'error',
        message:
          `${rules.name} allows ${limit} characters; this content is ` +
          `${length} (${length - limit} over).`,
      });
    }

    if (rules.requiresText && !trimmed) {
      issues.push({
        platform,
        code: 'text-required',
        severity: 'error',
        message: `${rules.name} requires a non-empty message.`,
      });
    }

    if (rules.maxHashtags !== undefined) {
      const hashtags = trimmed.match(HASHTAG_PATTERN)?.length ?? 0;
      if (hashtags > rules.maxHashtags) {
        issues.push({
          platform,
          code: 'too-many-hashtags',
          severity: 'error',
          message:
            `${rules.name} allows ${rules.maxHashtags} hashtags; this ` +
            `content has ${hashtags}.`,
        });
      }
    }

    if (rules.maxLinks !== undefined) {
      const links = trimmed.match(LINK_PATTERN)?.length ?? 0;
      if (links > rules.maxLinks) {
        issues.push({
          platform,
          code: 'too-many-links',
          severity: 'error',
          message:
            `${rules.name} allows ${rules.maxLinks} links; this content ` +
            `has ${links}.`,
        });
      }
    }

    return issues;
  }

  private validateMedia(
    content: ContentToValidate,
    rules: PlatformRules
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const platform = rules.identifier;
    const media = content.media ?? [];
    const { media: mediaRules } = rules;

    if (media.length < mediaRules.minAttachments) {
      issues.push({
        platform,
        code: 'media-required',
        severity: 'error',
        message:
          `${rules.name} requires at least ${mediaRules.minAttachments} ` +
          `attachment(s); this content has ${media.length}.`,
      });
    }

    if (media.length > mediaRules.maxAttachments) {
      issues.push({
        platform,
        code: 'too-many-attachments',
        severity: 'error',
        message:
          `${rules.name} allows ${mediaRules.maxAttachments} attachment(s); ` +
          `this content has ${media.length}.`,
      });
    }

    const kinds = new Set<MediaKind>();

    for (const item of media) {
      kinds.add(item.kind);

      if (!mediaRules.allowedKinds.includes(item.kind)) {
        issues.push({
          platform,
          code: 'unsupported-media-kind',
          severity: 'error',
          message:
            `${rules.name} does not accept ${item.kind} attachments ` +
            `(accepts: ${mediaRules.allowedKinds.join(', ')}).`,
        });
        // Size and duration ceilings are meaningless for a kind the platform
        // rejects outright, so skip them and keep the message actionable.
        continue;
      }

      issues.push(...this.validateMediaItem(item, rules));
    }

    if (!mediaRules.allowsMixedKinds && kinds.size > 1) {
      issues.push({
        platform,
        code: 'mixed-media-kinds',
        severity: 'error',
        message:
          `${rules.name} does not allow mixing ${[...kinds].join(' and ')} ` +
          `in one post.`,
      });
    }

    return issues;
  }

  private validateMediaItem(
    item: ValidationMedia,
    rules: PlatformRules
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const platform = rules.identifier;
    const { media: mediaRules } = rules;

    const maxSize = mediaRules.maxFileSizeBytes?.[item.kind];
    if (maxSize !== undefined && item.sizeBytes !== undefined) {
      if (item.sizeBytes > maxSize) {
        issues.push({
          platform,
          code: 'media-too-large',
          severity: 'error',
          message:
            `${rules.name} allows ${item.kind} files up to ` +
            `${this.formatMb(maxSize)}; this file is ` +
            `${this.formatMb(item.sizeBytes)}.`,
        });
      }
    }

    const duration = mediaRules.videoDurationSeconds;
    if (duration && item.kind === 'video' && item.durationSeconds !== undefined) {
      if (item.durationSeconds < duration.min) {
        issues.push({
          platform,
          code: 'video-too-short',
          severity: 'error',
          message:
            `${rules.name} requires videos of at least ${duration.min}s; ` +
            `this video is ${item.durationSeconds}s.`,
        });
      }
      if (item.durationSeconds > duration.max) {
        issues.push({
          platform,
          code: 'video-too-long',
          severity: 'error',
          message:
            `${rules.name} allows videos up to ${duration.max}s; this ` +
            `video is ${item.durationSeconds}s.`,
        });
      }
    }

    const ratioRules = mediaRules.aspectRatio;
    if (ratioRules && item.width && item.height) {
      const ratio = item.width / item.height;
      if (ratio < ratioRules.min || ratio > ratioRules.max) {
        issues.push({
          platform,
          // An out-of-range ratio is usually cropped by the platform rather
          // than rejected, so this warns instead of blocking the publish.
          code: 'aspect-ratio-out-of-range',
          severity: 'warning',
          message:
            `${rules.name} displays aspect ratios between ` +
            `${ratioRules.min.toFixed(2)} and ${ratioRules.max.toFixed(2)}; ` +
            `this media is ${ratio.toFixed(2)} and may be cropped.`,
        });
      }
    }

    return issues;
  }

  private formatMb(bytes: number): string {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
  }
}
