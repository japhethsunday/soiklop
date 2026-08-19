/**
 * Declarative per-platform publishing rules.
 *
 * The foundation's providers already expose `maxLength()` (text) and an async
 * `checkValidity()` that probes media files on disk. Neither can answer
 * "is this draft publishable to these platforms?" before media is uploaded,
 * and neither covers media counts, mixing rules, hashtag or link limits. This
 * table fills that gap with pure data so the composer, the API and the
 * publishing queue can all run identical pre-flight checks.
 *
 * `textLimit` here is a documented fallback only. Callers that have access to
 * the live provider should pass its `maxLength()` result to the validator,
 * because a provider can vary the limit per account tier or post type (X
 * premium, X articles) in ways a static table cannot express.
 */

export type MediaKind = 'image' | 'video' | 'gif' | 'document';

export interface MediaRules {
  /** Media kinds the platform accepts at all. */
  allowedKinds: MediaKind[];
  /** Maximum attachments in a single post. */
  maxAttachments: number;
  /** Minimum attachments; > 0 means the platform rejects text-only posts. */
  minAttachments: number;
  /** Whether images and videos may appear in the same post. */
  allowsMixedKinds: boolean;
  /** Per-file ceiling in bytes, by kind. Absent kind => no documented limit. */
  maxFileSizeBytes?: Partial<Record<MediaKind, number>>;
  /** Inclusive video duration bounds in seconds. */
  videoDurationSeconds?: { min: number; max: number };
  /** Inclusive width/height aspect-ratio bounds, as width divided by height. */
  aspectRatio?: { min: number; max: number };
}

export interface PlatformRules {
  /** Provider identifier, matching the provider class `identifier` field. */
  identifier: string;
  /** Human-readable platform name. */
  name: string;
  /** Documented fallback text limit; prefer the live provider's maxLength(). */
  textLimit: number;
  /** Maximum hashtags the platform counts before ignoring or rejecting them. */
  maxHashtags?: number;
  /** Maximum links permitted in the body. */
  maxLinks?: number;
  /** True when the platform requires a non-empty body. */
  requiresText: boolean;
  media: MediaRules;
}

const MB = 1024 * 1024;

/**
 * Rules are limited to platforms whose provider actually ships in this
 * repository. A platform absent from this table is treated as unvalidated
 * rather than silently assumed valid -- see `getPlatformRules`.
 */
export const PLATFORM_RULES: Readonly<Record<string, PlatformRules>> =
  Object.freeze({
    x: {
      identifier: 'x',
      name: 'X',
      textLimit: 280,
      maxLinks: 10,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video', 'gif'],
        maxAttachments: 4,
        minAttachments: 0,
        allowsMixedKinds: false,
        maxFileSizeBytes: { image: 5 * MB, gif: 15 * MB, video: 512 * MB },
        videoDurationSeconds: { min: 0.5, max: 140 },
        aspectRatio: { min: 1 / 3, max: 3 },
      },
    },
    instagram: {
      identifier: 'instagram',
      name: 'Instagram',
      textLimit: 2200,
      maxHashtags: 30,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video'],
        maxAttachments: 10,
        // Instagram has no text-only surface; every post carries media.
        minAttachments: 1,
        allowsMixedKinds: true,
        maxFileSizeBytes: { image: 8 * MB, video: 1024 * MB },
        videoDurationSeconds: { min: 3, max: 900 },
        aspectRatio: { min: 4 / 5, max: 1.91 },
      },
    },
    'instagram-standalone': {
      identifier: 'instagram-standalone',
      name: 'Instagram',
      textLimit: 2200,
      maxHashtags: 30,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video'],
        maxAttachments: 10,
        minAttachments: 1,
        allowsMixedKinds: true,
        maxFileSizeBytes: { image: 8 * MB, video: 1024 * MB },
        videoDurationSeconds: { min: 3, max: 900 },
        aspectRatio: { min: 4 / 5, max: 1.91 },
      },
    },
    facebook: {
      identifier: 'facebook',
      name: 'Facebook',
      textLimit: 63206,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video', 'gif'],
        maxAttachments: 10,
        minAttachments: 0,
        allowsMixedKinds: false,
        maxFileSizeBytes: { image: 10 * MB, video: 4096 * MB },
        videoDurationSeconds: { min: 1, max: 14400 },
      },
    },
    linkedin: {
      identifier: 'linkedin',
      name: 'LinkedIn',
      textLimit: 3000,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video', 'document'],
        maxAttachments: 20,
        minAttachments: 0,
        allowsMixedKinds: false,
        maxFileSizeBytes: {
          image: 10 * MB,
          video: 200 * MB,
          document: 100 * MB,
        },
        videoDurationSeconds: { min: 3, max: 1800 },
      },
    },
    'linkedin-page': {
      identifier: 'linkedin-page',
      name: 'LinkedIn Page',
      textLimit: 3000,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video', 'document'],
        maxAttachments: 20,
        minAttachments: 0,
        allowsMixedKinds: false,
        maxFileSizeBytes: {
          image: 10 * MB,
          video: 200 * MB,
          document: 100 * MB,
        },
        videoDurationSeconds: { min: 3, max: 1800 },
      },
    },
    tiktok: {
      identifier: 'tiktok',
      name: 'TikTok',
      textLimit: 2000,
      requiresText: false,
      media: {
        allowedKinds: ['video', 'image'],
        maxAttachments: 35,
        // TikTok publishes video or a photo carousel; there is no text-only post.
        minAttachments: 1,
        allowsMixedKinds: false,
        maxFileSizeBytes: { video: 4096 * MB, image: 20 * MB },
        videoDurationSeconds: { min: 3, max: 600 },
      },
    },
    'tiktok-business': {
      identifier: 'tiktok-business',
      name: 'TikTok Business',
      textLimit: 2200,
      requiresText: false,
      media: {
        allowedKinds: ['video', 'image'],
        maxAttachments: 35,
        minAttachments: 1,
        allowsMixedKinds: false,
        maxFileSizeBytes: { video: 4096 * MB, image: 20 * MB },
        videoDurationSeconds: { min: 3, max: 600 },
      },
    },
    youtube: {
      identifier: 'youtube',
      name: 'YouTube',
      textLimit: 5000,
      maxHashtags: 15,
      requiresText: false,
      media: {
        allowedKinds: ['video'],
        maxAttachments: 1,
        // A YouTube upload is the video; without one there is nothing to publish.
        minAttachments: 1,
        allowsMixedKinds: false,
        maxFileSizeBytes: { video: 128 * 1024 * MB },
        videoDurationSeconds: { min: 1, max: 43200 },
      },
    },
    pinterest: {
      identifier: 'pinterest',
      name: 'Pinterest',
      textLimit: 500,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video'],
        maxAttachments: 5,
        minAttachments: 1,
        allowsMixedKinds: false,
        maxFileSizeBytes: { image: 20 * MB, video: 2048 * MB },
        videoDurationSeconds: { min: 4, max: 900 },
        aspectRatio: { min: 1 / 2, max: 1 },
      },
    },
    threads: {
      identifier: 'threads',
      name: 'Threads',
      textLimit: 500,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video'],
        maxAttachments: 20,
        minAttachments: 0,
        allowsMixedKinds: true,
        maxFileSizeBytes: { image: 8 * MB, video: 1024 * MB },
        videoDurationSeconds: { min: 1, max: 300 },
      },
    },
    bluesky: {
      identifier: 'bluesky',
      name: 'Bluesky',
      textLimit: 300,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video'],
        maxAttachments: 4,
        minAttachments: 0,
        allowsMixedKinds: false,
        maxFileSizeBytes: { image: 1 * MB, video: 50 * MB },
        videoDurationSeconds: { min: 1, max: 60 },
      },
    },
    mastodon: {
      identifier: 'mastodon',
      name: 'Mastodon',
      textLimit: 500,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video', 'gif'],
        maxAttachments: 4,
        minAttachments: 0,
        allowsMixedKinds: false,
        maxFileSizeBytes: { image: 16 * MB, gif: 16 * MB, video: 99 * MB },
      },
    },
    telegram: {
      identifier: 'telegram',
      name: 'Telegram',
      textLimit: 4096,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video', 'gif', 'document'],
        maxAttachments: 10,
        minAttachments: 0,
        allowsMixedKinds: true,
        maxFileSizeBytes: {
          image: 10 * MB,
          video: 50 * MB,
          gif: 50 * MB,
          document: 50 * MB,
        },
      },
    },
    discord: {
      identifier: 'discord',
      name: 'Discord',
      textLimit: 1980,
      requiresText: false,
      media: {
        allowedKinds: ['image', 'video', 'gif', 'document'],
        maxAttachments: 10,
        minAttachments: 0,
        allowsMixedKinds: true,
        maxFileSizeBytes: {
          image: 8 * MB,
          video: 8 * MB,
          gif: 8 * MB,
          document: 8 * MB,
        },
      },
    },
  });

/**
 * Returns the rules for a platform, or `undefined` when the platform has no
 * documented ruleset. Callers must treat `undefined` as "cannot validate",
 * never as "valid" -- see `ContentValidationService`, which emits an explicit
 * `unknown-platform` issue rather than passing the content through silently.
 */
export function getPlatformRules(
  identifier: string
): PlatformRules | undefined {
  return PLATFORM_RULES[identifier];
}

export function listSupportedPlatforms(): string[] {
  return Object.keys(PLATFORM_RULES);
}
