import { getUrl } from "../shared";
import { LcAxios } from "../utils/httpUtils";

const graphqlStr = `
    query questionHints($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
            hints
        }
    }
`;

export const queryHints = async (titleSlug: string): Promise<string[]> => {
    return LcAxios(getUrl("graphql"), {
        method: "POST",
        data: {
            query: graphqlStr,
            variables: { titleSlug },
        },
    }).then((res) => res.data.data.question.hints);
};
