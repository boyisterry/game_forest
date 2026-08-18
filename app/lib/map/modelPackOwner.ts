import {
  disposeForestModelPack,
  loadForestModelPack,
} from "./treeModels.ts";
import type { ForestModelPack } from "./treeModels.ts";
import { createAsyncResourceOwner } from "./resourceLease.ts";
import type { AsyncResourceOwner } from "./resourceLease.ts";

export type ModelPackOwner = AsyncResourceOwner<ForestModelPack>;

export function createModelPackOwner(): ModelPackOwner {
  return createAsyncResourceOwner(loadForestModelPack, disposeForestModelPack);
}
