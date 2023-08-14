"use client";

import { ProjectHome } from "@/app/[project]/ProjectHome";
import { RecipeBodySearch } from "@/components/RecipeBody/RecipeBodySearch";
import { useRecipeSessionStore } from "@/state/recipeSession";
import { Recipe, RecipeProject, User } from "@/types/databaseExtended";
import classNames from "classnames";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UserTemplatePreview } from "@/types/databaseExtended";
import { ProfileHome } from "@/app/u/[username]/ProfileHome";

export function ProfileContainer({
  username,
  profile,
  templates,
  projects,
}: {
  username: string;
  profile: Pick<User, "profile_pic" | "first" | "last" | "username"> | null;
  templates: UserTemplatePreview[];
  projects: RecipeProject[];
}) {
  const currentSession = useRecipeSessionStore((state) => state.currentSession);
  const router = useRouter();

  useEffect(() => {
    if (!profile) {
      setTimeout(() => {
        router.push("/");
      }, 3000);
    }
  }, []);

  return (
    <div
      className={classNames(
        "flex-1 flex flex-col",
        currentSession === null && "sm:px-6 sm:pb-6 pt-8"
      )}
    >
      {!profile ? (
        <div className="flex items-center space-x-4 px-4">
          <span className="text-xl font-bold">
            No user found for {username}. Redirecting
          </span>
          <span className="loading loading-bars loading-lg"></span>
        </div>
      ) : (
        <ProfileHome
          templates={templates}
          profile={profile}
          projects={projects}
        />
      )}
    </div>
  );
}
