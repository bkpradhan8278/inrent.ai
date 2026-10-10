"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient, phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [magicLinkClient(), phoneNumberClient()] });

export const { useSession, signIn, signUp, signOut } = authClient;
