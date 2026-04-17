"use client";

import {
  useState,
  useMemo,
  useDeferredValue,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ThemedPageBackground,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Input,
  cn,
} from "@schemavaults/ui";
import { HelpCircle, Search } from "lucide-react";
import Link from "next/link";
import AuthActionButtons from "@/components/AuthActionButtons";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  answerComponent?: ReactNode;
}

interface HelpPageViewProps {
  invite_code_required: boolean;
}

export default function HelpPageView({
  invite_code_required,
}: HelpPageViewProps): ReactElement {
  const faqItems: FaqItem[] = useMemo(() => {
    const createAccountAnswer =
      "Navigate to the registration page and fill in your email address and password. Your password must be at least 10 characters long and include uppercase letters, lowercase letters, numbers, and special characters.";
    const inviteCodeRequirementAnswer =
      "An invite code is currently required to register. You will need to obtain a valid invite code from an administrator before you can create an account.";

    return [
      {
        id: "what-is-schemavaults",
        question: "What is SchemaVaults Auth?",
        answer:
          "SchemaVaults Auth is an authentication and authorization platform that provides secure user management, OAuth2 PKCE-based login flows, and API access control for your applications.",
      },
      {
        id: "create-account",
        question: "How do I create an account?",
        answer: invite_code_required
          ? `${createAccountAnswer} ${inviteCodeRequirementAnswer}`
          : createAccountAnswer,
        answerComponent: (
          <div className="flex flex-col gap-2">
            <p>{createAccountAnswer}</p>
            {invite_code_required ? <p>{inviteCodeRequirementAnswer}</p> : null}
          </div>
        ),
      },
      {
        id: "invite-code",
        question: "Do I need an invite code to register?",
        answer: invite_code_required
          ? "Yes, an invite code is currently required to create a new account. You will need to obtain a valid invite code from an administrator before you can register."
          : "No, an invite code is not currently required. You can register for a new account at any time without an invite code.",
      },
      {
        id: "reset-password",
        question: "How do I reset my password?",
        answer:
          "Go to the login page and click on the \"Forgot password?\" link. Enter the email address associated with your account, and you will receive a password reset link. The link will allow you to set a new password.",
      },
      {
        id: "verify-email",
        question: "How do I verify my email address?",
        answer:
          "After registering, you will receive a verification email. Click the link in the email to verify your address. If you did not receive the email, you can request a new verification link from the email verification page.",
      },
      {
        id: "connect-app",
        question: "How do I connect my application to SchemaVaults?",
        answer:
          "SchemaVaults uses the OAuth2 Authorization Code flow with PKCE for secure application integration. Register your application in the admin dashboard to receive a client app ID, then configure your application to use the SchemaVaults authorization endpoints with the @schemavaults/auth-client-sdk.",
      },
      {
        id: "open-source",
        question: "Is this open source?",
        answer:
          "Yes, SchemaVaults Auth is open source. The source code is available on GitHub at https://github.com/schemavaults/auth.",
        answerComponent: (
          <span>
            Yes, SchemaVaults Auth is open source. The source code is available
            on{" "}
            <a
              href="https://github.com/schemavaults/auth"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              GitHub
            </a>
            .
          </span>
        ),
      },
      {
        id: "create-organization",
        question: "How do I create an organization?",
        answer:
          "Once you are signed in, navigate to the \"Create organization\" page at /org/new, enter a name and any other required details, and submit the form. After creation you will be redirected to your new organization's page where you can manage members, invitations, and settings.",
        answerComponent: (
          <span>
            Once you are signed in, navigate to the{" "}
            <Link
              href="/org/new"
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              Create organization
            </Link>{" "}
            page, enter a name and any other required details, and submit the
            form. After creation you will be redirected to your new
            organization&apos;s page where you can manage members, invitations,
            and settings.
          </span>
        ),
      },
      {
        id: "join-organization",
        question: "How do I join an organization?",
        answer:
          "To join an organization, an owner or administrator of that organization must first send you an invitation. Once invited, sign in and open your account page \u2014 any pending invitations will be listed there. Accept an invitation to become a member of the organization.",
        answerComponent: (
          <span>
            To join an organization, an owner or administrator of that
            organization must first send you an invitation. Once invited, sign
            in and open your{" "}
            <Link
              href="/account"
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              account page
            </Link>{" "}
            &mdash; any pending invitations will be listed there. Accept an
            invitation to become a member of the organization.
          </span>
        ),
      },
      {
        id: "invite-user-to-organization",
        question: "How do I invite a user to my organization?",
        answer:
          "Open your organization's page from the organizations list on your account page. In the members section, use the invite form to add a user by email address or user ID. The invited user will see the invitation on their own account page and can accept or decline it. Only organization owners and administrators can send invitations.",
      },
    ];
  }, [invite_code_required]);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredFaqs = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    if (query.length === 0) {
      return faqItems;
    }
    return faqItems.filter((item) => {
      const haystack = `${item.question} ${item.answer}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [deferredQuery, faqItems]);

  return (
    <ThemedPageBackground
      className="items-center justify-center flex"
      backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
    >
      <Card
        className={cn(
          "w-11/12 xs:w-10/12 sm:w-3/4 md:w-2/3 lg:w-2/3 xl:w-2/3",
          "bg-white",
          "md:shadow-md",
          "md:rounded-lg",
          "p-4",
          "my-16",
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Help & FAQ
          </CardTitle>
          <CardDescription>
            Find answers to commonly asked questions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            icon={Search}
            placeholder="Search questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {filteredFaqs.length > 0 ? (
            <Accordion type="single" collapsible>
              {filteredFaqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>
                    {faq.answerComponent ?? faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No matching questions found.
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <AuthActionButtons />
        </CardFooter>
      </Card>
    </ThemedPageBackground>
  );
}
