"use client";

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { Bars3Icon, BugAntIcon, ListBulletIcon } from "@heroicons/react/24/outline";
import RegisterButton from "~~/app/_components/RegisterButton";
import { BlockVoteLogo } from "~~/components/assets/BlockVoteLogo";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuthContext } from "~~/contexts/AuthContext";
import { useOutsideClick, useScaffoldContractRead } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

const debugContractsLink: HeaderMenuLink = {
  label: "Debug Contracts",
  href: "/debug",
  icon: <BugAntIcon className="h-4 w-4" />,
};

const adminPageLink: HeaderMenuLink = {
  label: "Admin",
  href: "/admin",
};

export const HeaderMenuLinks = () => {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { isRegistered } = useAuthContext();

  const { data: owner } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "owner",
  });

  const canSeePolls = isConnected && (isRegistered || address === owner);

  const normalLinks = [
    {
      label: "Home",
      href: "/",
    },
    ...(canSeePolls
      ? [
          {
            label: "Polls",
            href: "/polls",
            icon: <ListBulletIcon className="h-4 w-4" />,
          },
        ]
      : []),
    ...(address === owner ? [adminPageLink, debugContractsLink] : []),
  ];

  return (
    <>
      {normalLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;

        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              prefetch={false}
              className={`${
                isActive ? "bg-secondary shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}

      {isConnected && !isRegistered && address !== owner && (
        <li className="flex items-center">
          <RegisterButton label="Register to Vote" compact />
        </li>
      )}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);

  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  return (
    <div className="sticky top-0 z-20 navbar min-h-0 flex-shrink-0 justify-between bg-base-100 px-0 shadow-md shadow-secondary sm:px-2 lg:static">
      <div className="navbar-start w-auto lg:w-1/2">
        <div className="dropdown lg:hidden" ref={burgerMenuRef}>
          <label
            tabIndex={0}
            className={`ml-1 btn btn-ghost ${isDrawerOpen ? "hover:bg-secondary" : "hover:bg-transparent"}`}
            onClick={() => {
              setIsDrawerOpen(prevIsOpenState => !prevIsOpenState);
            }}
          >
            <Bars3Icon className="h-1/2" />
          </label>

          {isDrawerOpen && (
            <ul
              tabIndex={0}
              className="menu menu-compact dropdown-content mt-3 w-52 rounded-box bg-base-100 p-2 shadow"
              onClick={() => {
                setIsDrawerOpen(false);
              }}
            >
              <HeaderMenuLinks />
            </ul>
          )}
        </div>

        <Link href="/" passHref className="ml-4 mr-6 hidden shrink-0 items-center gap-2 lg:flex">
          <div className="relative flex h-10 w-10">
            <BlockVoteLogo className="h-full w-full" />
          </div>

          <div className="flex flex-col">
            <span className="font-bold leading-tight">BlockVote</span>
            <span className="text-xs">Private Voting</span>
          </div>
        </Link>

        <ul className="menu menu-horizontal hidden gap-2 px-1 lg:flex lg:flex-nowrap">
          <HeaderMenuLinks />
        </ul>
      </div>

      <div className="navbar-end mr-4 flex-grow">
        <RainbowKitCustomConnectButton />
        <FaucetButton />
      </div>
    </div>
  );
};
