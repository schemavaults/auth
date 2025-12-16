export interface IDatabaseResourceGroup {
  hasBeenInitialized: () => Promise<boolean>;
  performSetupTasks: () => Promise<void>;
}
