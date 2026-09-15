export interface SingleFlightDispatchResult<TResult> {
  accepted: boolean;
  result: TResult | null;
}

export function createSingleFlightActionDispatcher<TAction, TResult>(handlers: {
  submit: (action: TAction) => Promise<TResult | null>;
  apply: (result: TResult) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  let pending = false;

  return {
    isPending: () => pending,
    async dispatch(action: TAction): Promise<SingleFlightDispatchResult<TResult>> {
      if (pending) return { accepted: false, result: null };
      pending = true;
      handlers.onPendingChange?.(true);
      try {
        const result = await handlers.submit(action);
        if (result !== null) handlers.apply(result);
        return { accepted: true, result };
      } finally {
        pending = false;
        handlers.onPendingChange?.(false);
      }
    },
  };
}