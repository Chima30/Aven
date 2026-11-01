// "server-only" throws when imported outside a React Server environment.
// Unit tests run in plain Node, so replace it with an empty module.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
