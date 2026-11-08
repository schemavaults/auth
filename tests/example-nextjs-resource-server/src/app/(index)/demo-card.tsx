import type { ReactElement, ReactNode } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@schemavaults/ui";

export interface DemoCardProps {
  title: string;
  /** What the demo shows, in a sentence or two. */
  children: ReactNode;
  /** The buttons that start the demo. */
  actions: ReactNode;
  /** `data-testid` of the card (`demo-card-<id>`). */
  id: string;
}

/** One demo on the home page: what it shows and how to start it. */
export function DemoCard({ title, children, actions, id }: DemoCardProps): ReactElement {
  return (
    <Card className="flex flex-col" data-testid={`demo-card-${id}`}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grow">
        <CardDescription className="text-sm leading-relaxed">{children}</CardDescription>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">{actions}</CardFooter>
    </Card>
  );
}

export default DemoCard;
