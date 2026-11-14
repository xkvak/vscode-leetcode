import { getUrl } from "../shared";
import { LcAxios } from "../utils/httpUtils";

const graphqlStr = `
    query questionOfToday {
        activeDailyCodingChallengeQuestion {
            question {
                questionFrontendId
            }
        }
    }
`;

export const queryDailyProblemId = async (): Promise<string> => {
    return LcAxios(getUrl("graphql"), {
        method: "POST",
        data: {
            query: graphqlStr,
            variables: {},
        },
    }).then((res) => res.data.data.activeDailyCodingChallengeQuestion.question.questionFrontendId);
};
