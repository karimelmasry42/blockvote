"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import RegisterButton from "./_components/RegisterButton";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import HeroImage from "~~/assets/private_voting.png";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuthContext } from "~~/contexts/AuthContext";

const Home: NextPage = () => {
  const { isConnected } = useAccount();
  const { isRegistered } = useAuthContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex flex-col flex-grow pt-12 pb-16">
      <div className="max-w-6xl mx-auto w-full px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-500/40 px-4 py-1 text-sm font-medium mb-5 opacity-90">
              Privacy-Preserving Voting with MACI
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              BlockVote: Private and Secure Decentralized Voting
            </h1>

            <p className="text-lg md:text-xl mt-6 leading-8 opacity-90 max-w-2xl">
              A privacy-preserving voting platform built with MACI to protect voter confidentiality, reduce coercion,
              and deliver trustworthy poll results.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {!mounted || !isConnected ? (
                <RainbowKitCustomConnectButton />
              ) : !isRegistered ? (
                <RegisterButton />
              ) : (
                <Link
                  href="/polls"
                  prefetch={false}
                  className="border border-slate-600 bg-primary px-5 py-3 rounded-lg font-bold hover:bg-secondary hover:shadow-md transition"
                >
                  Explore Polls
                </Link>
              )}
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-500/30 bg-base-100/40 px-4 py-4">
                <h3 className="font-semibold text-lg">Private Voting</h3>
                <p className="text-sm opacity-80 mt-2">Protects voter privacy and keeps ballot choices confidential.</p>
              </div>

              <div className="rounded-xl border border-slate-500/30 bg-base-100/40 px-4 py-4">
                <h3 className="font-semibold text-lg">Anti-Collusion</h3>
                <p className="text-sm opacity-80 mt-2">Uses MACI to reduce coercion and discourage vote buying.</p>
              </div>

              <div className="rounded-xl border border-slate-500/30 bg-base-100/40 px-4 py-4">
                <h3 className="font-semibold text-lg">Transparent Lifecycle</h3>
                <p className="text-sm opacity-80 mt-2">
                  Clear poll states, candidate details, and verifiable result flow.
                </p>
              </div>

              <div className="rounded-xl border border-slate-500/30 bg-base-100/40 px-4 py-4">
                <h3 className="font-semibold text-lg">Secure Participation</h3>
                <p className="text-sm opacity-80 mt-2">
                  Built for trustworthy decentralized elections and protected voter interaction.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-xl rounded-2xl overflow-hidden border border-slate-500/30 shadow-2xl">
              <Image
                src={HeroImage}
                alt="BlockVote private decentralized voting"
                className="w-full h-auto object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
