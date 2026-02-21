import { ensureAssessmentSchema } from "../src/lib/db";
import { importSurveyFromQuestionBank } from "../src/lib/survey";

async function main() {
  await ensureAssessmentSchema();

  const result = await importSurveyFromQuestionBank();
  console.log(
    JSON.stringify(
      {
        ok: true,
        surveyId: result.surveyId,
        versionNumber: result.versionNumber,
        sourceChecksum: result.sourceChecksum,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[survey:import] Failed", error);
  process.exitCode = 1;
});
