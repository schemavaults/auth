import type { ReactElement } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@schemavaults/ui";
import type { ApiDocsModel, ApiDocsResponse } from "@/model/types";
import { schemaTypeLabel } from "@/model/schema-utils";
import { MediaTypeSection } from "./RequestBodySection";

export interface ResponsesListProps {
  responses: readonly ApiDocsResponse[];
  schemas: ApiDocsModel["schemas"];
  showExample?: boolean;
}

export function responseStatusTone(status: string): string {
  if (status === "default") return "text-muted-foreground";
  const code = Number(status[0]);
  if (code === 2) return "text-emerald-600 dark:text-emerald-400";
  if (code === 3) return "text-sky-600 dark:text-sky-400";
  if (code === 4) return "text-amber-600 dark:text-amber-400";
  if (code === 5) return "text-destructive";
  return "text-muted-foreground";
}

export function ResponsesList({ responses, schemas, showExample }: ResponsesListProps): ReactElement {
  if (responses.length === 0) {
    return <p className="text-sm text-muted-foreground">No responses documented.</p>;
  }
  const defaultOpen = responses.filter((response) => response.status.startsWith("2")).map((r) => r.status);
  return (
    <Accordion type="multiple" defaultValue={defaultOpen} variant="bordered">
      {responses.map((response) => (
        <AccordionItem key={response.status} value={response.status}>
          <AccordionTrigger>
            <span className="flex flex-wrap items-center gap-2 text-left">
              <span className={cn("font-mono text-sm font-semibold", responseStatusTone(response.status))}>
                {response.status}
              </span>
              <span className="text-sm">{response.description}</span>
              {response.content.length === 0 ? (
                <Badge variant="outline" className="font-normal">no body</Badge>
              ) : null}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              {response.headers.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Header</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {response.headers.map((header) => (
                        <TableRow key={header.name}>
                          <TableCell className="font-mono text-xs">{header.name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {schemaTypeLabel(header.schema, schemas)}
                          </TableCell>
                          <TableCell className="text-xs">{header.description ?? ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {response.content.map((mediaType) => (
                <MediaTypeSection
                  key={mediaType.contentType}
                  mediaType={mediaType}
                  schemas={schemas}
                  showExample={showExample}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export default ResponsesList;
