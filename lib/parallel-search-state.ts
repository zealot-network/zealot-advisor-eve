import { defineState } from "eve/context";

/** How many Parallel searches this operator session has already used. */
export const operatorSearch = defineState<{ count: number }>("zealot.operatorSearch", () => ({ count: 0 }));
