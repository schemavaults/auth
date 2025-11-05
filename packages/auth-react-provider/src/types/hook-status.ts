// Check if loading
// If loaded, then check if success/error
// Then acccess data or error


type FinishedLoadingHookStatus<T extends object> = ({
  loading: false
}) & ({
  success: true;
  data: T;
} | {
  success: false;
  error: Error;
})

export type HookStatus<T extends object> = {
  loading: true;
  message?: string;
} | FinishedLoadingHookStatus<T>;
