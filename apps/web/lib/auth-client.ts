"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient, magicLinkClient, phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [magicLinkClient(), phoneNumberClient(), emailOTPClient()] });

export const { useSession, signIn, signUp, signOut } = authClient;
