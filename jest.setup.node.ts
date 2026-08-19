import 'reflect-metadata';

// Deterministic, credential-free defaults so unit tests never depend on a
// developer's local .env or reach a real service.
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';
