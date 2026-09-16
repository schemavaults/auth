import "server-only";
import { apiDocs } from "../api-docs";

export const generateStaticParams = apiDocs.generateStaticParams;
export const generateMetadata = apiDocs.generateOperationMetadata;

export default apiDocs.OperationPage;
