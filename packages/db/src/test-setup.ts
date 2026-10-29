import { afterEach } from "vitest";
import { closeTestDbs } from "./testing";

// Each test's in-memory Postgres is closed when it ends, so a worker's memory doesn't grow test by test.
afterEach(closeTestDbs);
