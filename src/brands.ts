import { Brand } from "effect";

export type EpochId = Brand.Branded<string, "EpochId">;
export const EpochId = Brand.nominal<EpochId>();

export type DatabaseName = Brand.Branded<string, "DatabaseName">;
export const DatabaseName = Brand.nominal<DatabaseName>();
