"use client";

import { useRouter } from "next/navigation";
import { useCallback, type FC, type ReactElement } from "react";
import { MfaChallengeForm } from "@schemavaults/auth-ui";

export interface MfaChallengePageViewProps {
  challenge_id: string;
  client_app_id: string;
  expires_at?: number;
}

const MfaChallengePageView: FC<MfaChallengePageViewProps> = ({
  challenge_id,
  client_app_id,
  expires_at,
}): ReactElement => {
  const router = useRouter();

  const onAuthenticated = useCallback(
    async (_authorization_code: string) => {
      // Send the user back into the post-login flow by reloading the
      // login page; the existing session check will short-circuit and
      // redirect onward. (A future commit can route directly to the
      // OAuth2 callback if a redirect_uri is provided.)
      router.replace("/account");
    },
    [router],
  );

  const onChallengeExpired = useCallback(() => {
    router.replace("/auth/login");
  }, [router]);

  if (!challenge_id || !client_app_id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p className="text-sm text-destructive">
          Missing MFA challenge parameters. Please log in again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <MfaChallengeForm
        challenge_id={challenge_id}
        client_app_id={client_app_id}
        expires_at={expires_at}
        onAuthenticated={onAuthenticated}
        onChallengeExpired={onChallengeExpired}
      />
    </div>
  );
};

export default MfaChallengePageView;
