import { StateCreator, create } from "zustand";
import { Recipe } from "../types/recipes";
import { produce } from "immer";
import { getArrayPathIndex, isArrayPath } from "../utils/main";
import { v4 as uuidv4 } from "uuid";
import { useEffect } from "react";
import { useInterval, useLocalStorage } from "usehooks-ts";

import giphy_recipes from "../assets/recipes/giphy.json";
import openai from "../assets/recipes/openai.json";
import pokeapi from "../assets/recipes/pokeapi.json";
import reddit from "../assets/recipes/reddit.json";

const recipes: Recipe[] = [
  ...openai,
  ...giphy_recipes,
  ...reddit,
  ...pokeapi,
] as Recipe[];

export interface RecipeSession {
  id: string;
  name: string;
  recipe: Recipe;
}

interface RecipeSessionSlice {
  currentSession: RecipeSession | null;
  sessions: RecipeSession[];

  setSessions: (sessions: RecipeSession[]) => void;
  setCurrentSession: (session: RecipeSession | null) => void;
  updateSessionName: (session: RecipeSession, name: string) => void;

  addSession: (selectedRecipe: Recipe) => void;
  closeSession: (session: RecipeSession) => void;
}

export enum RecipeBodyRoute {
  Parameters = "Parameters",
  Examples = "Examples",
  Config = "Config",
}

export enum RecipeOutputType {
  Response = "Response",
  Error = "Error",
}

export enum RecipeOutputTab {
  Output = "Response",
  Docs = "Docs",
}
export type RecipeParameters = {
  requestBody: Record<string, unknown>;
  queryParams: Record<string, unknown>;
};

const getEmptyParameters = (): RecipeParameters => ({
  requestBody: {},
  queryParams: {},
});

interface RecipeOutputSlice {
  isSending: boolean;
  setIsSending: (isSending: boolean) => void;

  output: Record<string, unknown>;
  outputType: RecipeOutputType;

  setOutput: (params: {
    output: Record<string, unknown>;
    outputType: RecipeOutputType;
  }) => void;

  outputTab: RecipeOutputTab;
  setOutputTab: (tab: RecipeOutputTab) => void;

  clearOutput: () => void;
}

interface RecipeBodySlice {
  bodyRoute: RecipeBodyRoute;
  setBodyRoute: (route: RecipeBodyRoute) => void;
  recipes: Recipe[];

  requestBody: Record<string, unknown>;
  setRequestBody: (requestBody: Record<string, unknown>) => void;
  updateRequestBody: (updateProps: { path: string; value: unknown }) => void;

  queryParams: Record<string, unknown>;
  setQueryParams: (queryParams: Record<string, unknown>) => void;
  updateQueryParams: (updateProps: { path: string; value: unknown }) => void;
}

interface FileManagerSlice {
  fileManager: Record<string, File>;
  updateFileManager: (path: string, file: File) => void;
  deleteFileManager: (path: string) => void;
}

export enum DeepActionType {
  UpdateRecipeInput = "UpdateRecipeInput",
}
interface UpdateRecipeInputAction {
  type: DeepActionType.UpdateRecipeInput;
  payload: string;
}

type DeepAction = UpdateRecipeInputAction;
export interface DeepActionsSlice {
  deepActions: DeepAction[];
  clearDeepAction: (type: DeepActionType) => void;
  addDeepAction: (action: DeepAction) => void;
}

type Slices = RecipeSessionSlice &
  RecipeBodySlice &
  RecipeOutputSlice &
  FileManagerSlice &
  DeepActionsSlice;

const createDeepActionSlice: StateCreator<Slices, [], [], DeepActionsSlice> = (
  set
) => {
  return {
    deepActions: [],
    clearDeepAction: (type) => {
      set((prevState) => {
        return {
          deepActions: prevState.deepActions.filter((a) => a.type !== type),
        };
      });
    },
    addDeepAction: (action) => {
      set((prevState) => {
        return {
          deepActions: [...prevState.deepActions, action],
        };
      });
    },
  };
};

export interface LocalStorageState {
  sessions: RecipeSession[];
  currentSession: RecipeSessionSlice["currentSession"];
  requestBody: Record<string, unknown>;
  queryParams: Record<string, unknown>;
}

const createRecipeSessionSlice: StateCreator<
  Slices,
  [],
  [],
  RecipeSessionSlice
> = (set) => {
  return {
    currentSession: null,
    sessions: [],
    setSessions: (sessions) => set(() => ({ sessions })),

    // TODO: Need a more failsafe way of doing this....
    // IT IS IMPORTANT TO PRESERVE THE CURRENT SESSION REQUEST LOCALLY WHEN CHANGING SESSIONS
    setCurrentSession: (session) =>
      set((prevState) => {
        if (prevState.currentSession) {
          preserveSessionParamsToLocal({
            sessionId: prevState.currentSession.id,
            params: {
              requestBody: prevState.requestBody,
              queryParams: prevState.queryParams,
            },
          });
        }

        const oldParams = session
          ? retrieveParamsForSessionIdFromLocal(session.id)
          : getEmptyParameters();

        return {
          currentSession: session,
          requestBody: oldParams.requestBody,
          queryParams: oldParams.queryParams,
          bodyRoute: RecipeBodyRoute.Parameters,
          outputTab: RecipeOutputTab.Docs,
        };
      }),

    updateSessionName: (session, name) =>
      set((prevState) => {
        const sessions = prevState.sessions.map((s) => {
          if (s.id === session.id) {
            return {
              ...s,
              name,
            };
          }
          return s;
        });

        return {
          sessions,
        };
      }),

    addSession: (selectedRecipe) =>
      set((prevState) => {
        if (prevState.currentSession) {
          preserveSessionParamsToLocal({
            sessionId: prevState.currentSession.id,
            params: {
              requestBody: prevState.requestBody,
              queryParams: prevState.queryParams,
            },
          });
        }

        const newSession: RecipeSession = {
          id: uuidv4(),
          name: selectedRecipe.title,
          recipe: selectedRecipe,
        };

        return {
          bodyRoute: RecipeBodyRoute.Parameters,
          currentSession: newSession,
          sessions: [...prevState.sessions, newSession],
          outputTab: RecipeOutputTab.Docs,
          ...getEmptyParameters(),
        };
      }),
    closeSession: (session) =>
      set((prevState) => {
        deleteParamsForSessionIdFromLocal(session.id);

        let nextSessionIndex = -1;
        const sessions = prevState.sessions.filter((s, i) => {
          if (s.id === session.id) {
            if (prevState.sessions[i - 1]) nextSessionIndex = i - 1;
            if (prevState.sessions[i + 1]) nextSessionIndex = i + 1;

            return false;
          }

          return true;
        });

        const nextSession = prevState.sessions[nextSessionIndex];

        if (!nextSession) {
          return {
            currentSession: null,
            sessions,
          };
        }

        const oldParams = nextSession
          ? retrieveParamsForSessionIdFromLocal(nextSession.id)
          : getEmptyParameters();

        return {
          bodyRoute: RecipeBodyRoute.Parameters,
          currentSession: nextSession,
          sessions,
          requestBody: oldParams.requestBody,
          queryParams: oldParams.queryParams,
        };
      }),
  };
};

const createRecipeBodySlice: StateCreator<Slices, [], [], RecipeBodySlice> = (
  set
) => {
  function updateDraftParams({
    path,
    value,
    draft,
  }: {
    path: string;
    value: unknown;
    draft: Record<string, unknown>;
  }) {
    const paths = path.split(".").slice(1);

    while (paths.length > 1) {
      const current = paths.shift()!;
      draft = (
        isArrayPath(current)
          ? draft[getArrayPathIndex(current)]
          : draft[current]
      ) as typeof draft;
    }

    const finalPath = paths[0];
    if (value === undefined) {
      delete draft[finalPath];
      return;
    } else {
      if (isArrayPath(finalPath)) {
        draft[getArrayPathIndex(finalPath)] = value;
      } else {
        draft[finalPath] = value;
      }
    }
  }

  return {
    bodyRoute: RecipeBodyRoute.Parameters,
    setBodyRoute: (route) => set(() => ({ bodyRoute: route })),

    recipes,

    requestBody: {},
    setRequestBody: (requestBody) => set(() => ({ requestBody })),
    updateRequestBody: ({ path, value }) =>
      set((prevState) => {
        const nextState = produce(prevState.requestBody, (draft) => {
          updateDraftParams({ path, value, draft });
        });

        return { requestBody: nextState };
      }),

    queryParams: {},
    setQueryParams: (queryParams) => set(() => ({ queryParams })),
    updateQueryParams: ({ path, value }) =>
      set((prevState) => {
        const nextState = produce(prevState.queryParams, (draft) => {
          updateDraftParams({ path, value, draft });
        });

        return { queryParams: nextState };
      }),
  };
};

const createRecipeOutputSlice: StateCreator<
  Slices,
  [],
  [],
  RecipeOutputSlice
> = (set) => {
  return {
    isSending: false,
    setIsSending: (isSending) =>
      set(() => ({ isSending, outputTab: RecipeOutputTab.Output })),

    output: {},
    setOutput: ({ output, outputType }) =>
      set(() => {
        return { output, outputTab: RecipeOutputTab.Output, outputType };
      }),

    outputType: RecipeOutputType.Response,

    outputTab: RecipeOutputTab.Docs,
    setOutputTab: (tab) => set(() => ({ outputTab: tab })),

    clearOutput: () => set(() => ({ output: {} })),
  };
};

const createFileManagerSlice: StateCreator<Slices, [], [], FileManagerSlice> = (
  set
) => {
  return {
    fileManager: {},
    updateFileManager: (path, file) =>
      set((prevState) => ({
        fileManager: {
          ...prevState.fileManager,
          [path]: file,
        },
      })),
    deleteFileManager: (path) =>
      set((prevState) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [path]: _, ...nextFileManager } = prevState.fileManager;
        return { fileManager: nextFileManager };
      }),
  };
};

export const useRecipeSessionStore = create<Slices>()((...a) => ({
  ...createRecipeSessionSlice(...a),
  ...createRecipeBodySlice(...a),
  ...createRecipeOutputSlice(...a),
  ...createFileManagerSlice(...a),
  ...createDeepActionSlice(...a),
}));

const GLOBAL_POLLING_FACTOR = 10000;
const SESSION_HYDRATION_KEY = "SESSION_HYDRATION_KEY";
const RECIPE_BODY_PARAMS_KEY_PREFIX = "RECIPE_BODY_PARAMS_";
const RECIPE_QUERY_PARAMS_KEY_PREFIX = "RECIPE_QUERY_PARAMS_";

function getRecipeBodyParamsKey(recipeId: string) {
  return RECIPE_BODY_PARAMS_KEY_PREFIX + recipeId;
}

function getRecipeQueryParamsKey(recipeId: string) {
  return RECIPE_QUERY_PARAMS_KEY_PREFIX + recipeId;
}

/*
This is definitely a naive, unoptimized, approach to storing data locally.

Basically, save everything relevant to use every GLOBAL_POLLING_FACTOR seconds.
*/
export function useSaveRecipeUI() {
  const [localSave, setLocalSave] = useLocalStorage<LocalStorageState | null>(
    SESSION_HYDRATION_KEY,
    {
      currentSession: null,
      sessions: [],
      ...getEmptyParameters(),
    }
  );

  const sessions = useRecipeSessionStore((state) => state.sessions);
  const currentSession = useRecipeSessionStore((state) => state.currentSession);
  const setSessions = useRecipeSessionStore((state) => state.setSessions);
  const setCurrentSession = useRecipeSessionStore(
    (state) => state.setCurrentSession
  );
  const setRequestBody = useRecipeSessionStore((state) => state.setRequestBody);
  const requestBody = useRecipeSessionStore((state) => state.requestBody);
  const queryParams = useRecipeSessionStore((state) => state.queryParams);
  const setQueryParams = useRecipeSessionStore((state) => state.setQueryParams);

  // On mount, hydrate from local storage
  useEffect(() => {
    console.log("Hydrating from local storage");

    if (!localSave) return;
    if (localSave.currentSession) setCurrentSession(localSave.currentSession);
    if (localSave.sessions) setSessions(localSave.sessions);
    if (localSave.requestBody) setRequestBody(localSave.requestBody);
    if (localSave.queryParams) setQueryParams(localSave.queryParams);
  }, []);

  // Save changes every POLLING_FACTOR seconds
  useInterval(() => {
    setLocalSave({
      currentSession,
      sessions,
      requestBody,
      queryParams,
    });
  }, GLOBAL_POLLING_FACTOR);
}

// We only need to save the session when we change tabs
function preserveSessionParamsToLocal({
  sessionId,
  params: { requestBody, queryParams },
}: {
  sessionId: string;
  params: RecipeParameters;
}) {
  localStorage.setItem(
    getRecipeBodyParamsKey(sessionId),
    JSON.stringify(requestBody)
  );
  localStorage.setItem(
    getRecipeQueryParamsKey(sessionId),
    JSON.stringify(queryParams)
  );
}

function retrieveParamsForSessionIdFromLocal(
  sessionId: string
): RecipeParameters {
  return {
    requestBody: JSON.parse(
      localStorage.getItem(getRecipeBodyParamsKey(sessionId)) || "{}"
    ),
    queryParams: JSON.parse(
      localStorage.getItem(getRecipeQueryParamsKey(sessionId)) || "{}"
    ),
  };
}

function deleteParamsForSessionIdFromLocal(sessionId: string) {
  localStorage.removeItem(getRecipeBodyParamsKey(sessionId));
  localStorage.removeItem(getRecipeQueryParamsKey(sessionId));
}
