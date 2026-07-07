import "server-only";

import { ImageResponse } from "next/og";
import {
  GENERATED_OPENGRAPH_IMAGE_WIDTH,
  GENERATED_OPENGRAPH_IMAGE_HEIGHT,
  type OpenGraphImageBranding,
} from "@/lib/branding/generated-og-image";

const MAX_DESCRIPTION_LENGTH = 140;

function truncateDescription(description: string): string {
  if (description.length <= MAX_DESCRIPTION_LENGTH) {
    return description;
  }
  return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

function wordmarkFontSize(friendlyName: string): number {
  if (friendlyName.length > 32) return 56;
  if (friendlyName.length > 20) return 76;
  return 104;
}

/**
 * Render the default opengraph image for this deployment from its white-label
 * branding config: the friendly name drawn as a theme-gradient wordmark
 * (matching the in-app <Wordmark />) above the deployment description, with a
 * theme-gradient accent bar along the bottom edge.
 */
export function generatedOpenGraphImageResponse(
  branding: OpenGraphImageBranding,
  init?: ResponseInit,
): ImageResponse {
  const [color_1, color_2] = branding.themeColors;
  const gradient = `linear-gradient(135deg, ${color_1}, ${color_2})`;
  const description = truncateDescription(branding.description);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          padding: "64px 80px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: wordmarkFontSize(branding.friendlyName),
            fontWeight: 700,
            backgroundImage: gradient,
            backgroundClip: "text",
            color: "transparent",
            textAlign: "center",
            maxWidth: "100%",
          }}
        >
          {branding.friendlyName}
        </div>
        {description.length > 0 ? (
          <div
            style={{
              display: "flex",
              fontSize: 36,
              color: "#4b5563",
              marginTop: 36,
              textAlign: "center",
              maxWidth: "90%",
            }}
          >
            {description}
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: 24,
            backgroundImage: gradient,
          }}
        />
      </div>
    ),
    {
      width: GENERATED_OPENGRAPH_IMAGE_WIDTH,
      height: GENERATED_OPENGRAPH_IMAGE_HEIGHT,
      ...init,
    },
  );
}

export default generatedOpenGraphImageResponse;
