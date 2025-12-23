export type UiToastFn = (toastOpts: {
  title: string;
  description: string;
  variant?: "destructive" | "warning";
}) => void;

export type UseUiToastHook = () => { toast: UiToastFn };
