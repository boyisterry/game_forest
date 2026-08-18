import {
  collisionCacheKey,
  compileCollisionSource,
  hashCollisionCompileSource,
  serializeCompiledCollision,
} from "./cityCollisionCompileCore.ts";
import type {
  CollisionWorkerCommand,
  CollisionWorkerResult,
  PackedCollisionCompileSource,
} from "./cityCollisionWire.ts";

type Registration = Readonly<{
  generation: number;
  token: number;
  source: PackedCollisionCompileSource;
  sourceHash: string;
}>;

/** Stateful protocol core shared by the real Worker and deterministic Node tests. */
export class CityCollisionCompilerProtocol {
  private readonly registrations = new Map<string, Registration>();
  private readonly latestGenerations = new Map<string, number>();
  private readonly latestRegisterTokens = new Map<string, number>();
  private nextToken = 1;

  async handle(command: CollisionWorkerCommand): Promise<CollisionWorkerResult> {
    try {
      if (command.type === "register") return await this.register(command);
      if (command.type === "compile") return await this.compile(command);
      return this.release(command);
    } catch (error) {
      return {
        type: "error",
        requestId: command.requestId,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async register(
    command: Extract<CollisionWorkerCommand, { type: "register" }>,
  ): Promise<CollisionWorkerResult> {
    if (command.source.sourceId !== command.sourceId
      || command.source.generation !== command.generation) {
      throw new Error("register envelope does not match packed source identity");
    }
    const token = this.nextToken;
    this.nextToken += 1;
    this.latestGenerations.set(command.sourceId, command.generation);
    this.latestRegisterTokens.set(command.sourceId, token);
    this.registrations.delete(command.sourceId);
    const sourceHash = await hashCollisionCompileSource(command.source);
    if (this.latestRegisterTokens.get(command.sourceId) !== token) {
      return this.stale(command.requestId, command.sourceId, command.generation);
    }
    this.registrations.set(command.sourceId, {
      generation: command.generation,
      token,
      source: command.source,
      sourceHash,
    });
    return {
      type: "registered",
      requestId: command.requestId,
      sourceId: command.sourceId,
      generation: command.generation,
      registrationToken: token,
      sourceHash,
      cacheKey: collisionCacheKey(sourceHash),
    };
  }

  private async compile(
    command: Extract<CollisionWorkerCommand, { type: "compile" }>,
  ): Promise<CollisionWorkerResult> {
    const registration = this.registrations.get(command.sourceId);
    if (!registration
      || registration.generation !== command.generation
      || registration.token !== command.registrationToken) {
      return this.stale(command.requestId, command.sourceId, command.generation);
    }
    const compiled = await compileCollisionSource(registration.source);
    const current = this.registrations.get(command.sourceId);
    if (current !== registration) {
      return this.stale(command.requestId, command.sourceId, command.generation);
    }
    if (compiled.sourceHash !== registration.sourceHash) {
      throw new Error("registered collision source was mutated after hashing");
    }
    return {
      type: "compiled",
      requestId: command.requestId,
      sourceId: command.sourceId,
      generation: command.generation,
      registrationToken: command.registrationToken,
      payload: serializeCompiledCollision(compiled),
    };
  }

  private release(
    command: Extract<CollisionWorkerCommand, { type: "release" }>,
  ): CollisionWorkerResult {
    const registration = this.registrations.get(command.sourceId);
    if (!registration
      || registration.generation !== command.generation
      || registration.token !== command.registrationToken) {
      return this.stale(command.requestId, command.sourceId, command.generation);
    }
    this.registrations.delete(command.sourceId);
    this.latestGenerations.delete(command.sourceId);
    this.latestRegisterTokens.delete(command.sourceId);
    return {
      type: "released",
      requestId: command.requestId,
      sourceId: command.sourceId,
      registrationToken: command.registrationToken,
    };
  }

  private stale(requestId: number, sourceId: string, requestedGeneration: number): CollisionWorkerResult {
    return {
      type: "stale",
      requestId,
      sourceId,
      requestedGeneration,
      currentGeneration: this.latestGenerations.get(sourceId) ?? null,
    };
  }
}
