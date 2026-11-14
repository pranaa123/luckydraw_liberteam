import { httpSession } from './http-session.mjs';
import { fixtureCredentials } from './auth-fixture.mjs';

export const qaSession = origin => httpSession(origin,{
  email:process.env.DOORPRIZE_TEST_EMAIL || fixtureCredentials.email,
  password:process.env.DOORPRIZE_TEST_PASSWORD || fixtureCredentials.password,
});
