describe('test harness', () => {
  it('runs TypeScript specs with decorator metadata enabled', () => {
    expect(Reflect).toHaveProperty('getMetadata');
  });

  it('pins the clock to UTC so scheduling assertions are stable', () => {
    expect(new Date('2026-01-01T00:00:00Z').getHours()).toBe(0);
  });
});
