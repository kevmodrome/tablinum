import { Console, Effect } from "effect";

const program = Effect.gen(function* () {
  yield* Console.log("douala-v4 is running");
  return 42;
});

Effect.runPromise(program).then((result) => {
  console.log(`Result: ${result}`);
});
