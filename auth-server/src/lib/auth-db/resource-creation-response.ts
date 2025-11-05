
export type ResourceCreationResponse = {
  success: true;
  message: string;
  resource_id: string;
} | {
  success: false;
  message: string;
}
