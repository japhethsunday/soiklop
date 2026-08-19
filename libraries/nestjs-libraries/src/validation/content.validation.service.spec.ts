import {
  ContentValidationService,
  ValidationMedia,
} from '@gitroom/nestjs-libraries/validation/content.validation.service';
import {
  getPlatformRules,
  listSupportedPlatforms,
  PLATFORM_RULES,
} from '@gitroom/nestjs-libraries/validation/platform.rules';

const MB = 1024 * 1024;

describe('ContentValidationService', () => {
  let service: ContentValidationService;

  beforeEach(() => {
    service = new ContentValidationService();
  });

  const codesFor = (result: any, platform: string): string[] =>
    result.byPlatform[platform].issues.map((i: any) => i.code);

  describe('unknown platforms', () => {
    it('refuses to validate a platform with no ruleset instead of passing it', () => {
      const result = service.validate({ text: 'hello' }, ['myspace']);

      expect(result.valid).toBe(false);
      expect(codesFor(result, 'myspace')).toEqual(['unknown-platform']);
    });
  });

  describe('text limits', () => {
    it('rejects content over the platform limit', () => {
      const result = service.validate({ text: 'a'.repeat(301) }, ['bluesky']);

      expect(result.valid).toBe(false);
      expect(codesFor(result, 'bluesky')).toContain('text-too-long');
    });

    it('accepts content exactly at the limit', () => {
      const result = service.validate({ text: 'a'.repeat(300) }, ['bluesky']);

      expect(result.valid).toBe(true);
    });

    it('counts emoji as single characters rather than UTF-16 units', () => {
      // 300 thumbs-up is 300 characters to Bluesky but 600 `.length` units.
      const result = service.validate({ text: '👍'.repeat(300) }, ['bluesky']);

      expect(result.valid).toBe(true);
    });

    it('prefers a live provider limit over the static table', () => {
      // X premium raises 280 to 4000; the table alone would wrongly reject.
      const text = 'a'.repeat(1000);

      expect(service.validate({ text }, ['x']).valid).toBe(false);
      expect(
        service.validate({ text }, ['x'], (id) => (id === 'x' ? 4000 : undefined))
          .valid
      ).toBe(true);
    });
  });

  describe('per-platform independence', () => {
    it('accepts for one platform and rejects for another in the same call', () => {
      // 500 chars: fine on LinkedIn (3000), too long for Bluesky (300).
      const result = service.validate({ text: 'a'.repeat(500) }, [
        'linkedin',
        'bluesky',
      ]);

      expect(result.valid).toBe(false);
      expect(result.byPlatform['linkedin'].valid).toBe(true);
      expect(result.byPlatform['bluesky'].valid).toBe(false);
    });
  });

  describe('hashtags and links', () => {
    it('rejects more hashtags than Instagram permits', () => {
      const text = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
      const result = service.validate({ text, media: [image()] }, ['instagram']);

      expect(codesFor(result, 'instagram')).toContain('too-many-hashtags');
    });

    it('accepts exactly the permitted number of hashtags', () => {
      const text = Array.from({ length: 30 }, (_, i) => `#tag${i}`).join(' ');
      const result = service.validate({ text, media: [image()] }, ['instagram']);

      expect(result.byPlatform['instagram'].valid).toBe(true);
    });

    it('does not count a URL fragment as a hashtag', () => {
      const text =
        Array.from({ length: 30 }, (_, i) => `#tag${i}`).join(' ') +
        ' https://example.com/page#section';
      const result = service.validate({ text, media: [image()] }, ['instagram']);

      expect(codesFor(result, 'instagram')).not.toContain('too-many-hashtags');
    });
  });

  describe('media requirements', () => {
    it('rejects a text-only post on a media-required platform', () => {
      const result = service.validate({ text: 'launch day' }, ['instagram']);

      expect(codesFor(result, 'instagram')).toContain('media-required');
    });

    it('allows a text-only post where the platform supports it', () => {
      const result = service.validate({ text: 'launch day' }, ['x']);

      expect(result.valid).toBe(true);
    });

    it('rejects more attachments than the platform accepts', () => {
      const result = service.validate(
        { text: 'hi', media: Array.from({ length: 5 }, () => image()) },
        ['x']
      );

      expect(codesFor(result, 'x')).toContain('too-many-attachments');
    });

    it('rejects a media kind the platform does not support', () => {
      const result = service.validate(
        { text: 'hi', media: [{ kind: 'document', sizeBytes: 1 * MB }] },
        ['x']
      );

      expect(codesFor(result, 'x')).toContain('unsupported-media-kind');
    });

    it('does not report a size error for a kind it already rejected', () => {
      const result = service.validate(
        { text: 'hi', media: [{ kind: 'document', sizeBytes: 900 * MB }] },
        ['x']
      );

      expect(codesFor(result, 'x')).toEqual(['unsupported-media-kind']);
    });

    it('rejects mixing images and video where the platform forbids it', () => {
      const result = service.validate(
        { text: 'hi', media: [image(), video()] },
        ['x']
      );

      expect(codesFor(result, 'x')).toContain('mixed-media-kinds');
    });

    it('permits mixed media where the platform allows it', () => {
      const result = service.validate(
        { text: 'hi', media: [image(), video({ durationSeconds: 30 })] },
        ['telegram']
      );

      expect(result.byPlatform['telegram'].valid).toBe(true);
    });
  });

  describe('media size and duration', () => {
    it('rejects an oversized image', () => {
      const result = service.validate(
        { text: 'hi', media: [image({ sizeBytes: 6 * MB })] },
        ['x']
      );

      expect(codesFor(result, 'x')).toContain('media-too-large');
    });

    it('does not size-check media of unknown size', () => {
      const result = service.validate(
        { text: 'hi', media: [{ kind: 'image' }] },
        ['x']
      );

      expect(codesFor(result, 'x')).not.toContain('media-too-large');
    });

    it('rejects a video longer than the platform allows', () => {
      const result = service.validate(
        { text: 'hi', media: [video({ durationSeconds: 200 })] },
        ['x']
      );

      expect(codesFor(result, 'x')).toContain('video-too-long');
    });

    it('rejects a video shorter than the platform allows', () => {
      const result = service.validate(
        { text: 'hi', media: [video({ durationSeconds: 1 })] },
        ['instagram']
      );

      expect(codesFor(result, 'instagram')).toContain('video-too-short');
    });
  });

  describe('aspect ratio', () => {
    it('warns rather than blocks when the ratio is out of range', () => {
      const result = service.validate(
        { text: 'hi', media: [image({ width: 100, height: 1000 })] },
        ['x']
      );

      const issue = result.byPlatform['x'].issues.find(
        (i) => i.code === 'aspect-ratio-out-of-range'
      );

      expect(issue?.severity).toBe('warning');
      // A warning must not make the content unpublishable.
      expect(result.byPlatform['x'].valid).toBe(true);
    });

    it('does not warn for an in-range ratio', () => {
      const result = service.validate(
        { text: 'hi', media: [image({ width: 1080, height: 1080 })] },
        ['x']
      );

      expect(codesFor(result, 'x')).not.toContain('aspect-ratio-out-of-range');
    });
  });

  describe('issue messages', () => {
    it('states the actual and permitted values so the user can act on it', () => {
      const result = service.validate({ text: 'a'.repeat(305) }, ['bluesky']);
      const message = result.byPlatform['bluesky'].issues[0].message;

      expect(message).toContain('300');
      expect(message).toContain('305');
    });
  });
});

describe('platform rules table', () => {
  it('keys every entry by its own identifier', () => {
    for (const [key, rules] of Object.entries(PLATFORM_RULES)) {
      expect(rules.identifier).toBe(key);
    }
  });

  it('declares coherent attachment bounds', () => {
    for (const rules of Object.values(PLATFORM_RULES)) {
      expect(rules.media.minAttachments).toBeLessThanOrEqual(
        rules.media.maxAttachments
      );
      expect(rules.media.allowedKinds.length).toBeGreaterThan(0);
    }
  });

  it('covers the platforms the product prioritises', () => {
    const supported = listSupportedPlatforms();

    for (const platform of [
      'instagram',
      'facebook',
      'linkedin',
      'x',
      'tiktok',
      'youtube',
      'pinterest',
      'threads',
      'bluesky',
      'mastodon',
      'telegram',
      'discord',
    ]) {
      expect(supported).toContain(platform);
    }
  });

  it('returns undefined for an unknown platform rather than a default', () => {
    expect(getPlatformRules('myspace')).toBeUndefined();
  });
});

function image(over: Partial<ValidationMedia> = {}): ValidationMedia {
  return { kind: 'image', sizeBytes: 1 * MB, ...over };
}

function video(over: Partial<ValidationMedia> = {}): ValidationMedia {
  return { kind: 'video', sizeBytes: 10 * MB, durationSeconds: 30, ...over };
}
