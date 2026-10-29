import { closeTestDbs } from "@chukta/db/testing";
import { afterEach } from "vitest";

// Each test's in-memory Postgres is closed when it ends, so a worker's memory doesn't grow test by test.
afterEach(closeTestDbs);
