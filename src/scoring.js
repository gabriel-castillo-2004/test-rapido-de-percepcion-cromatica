export const SPECIAL_ANSWERS = Object.freeze({
  NOTHING_SEEN: "nothing_seen",
  SKIPPED: "skipped",
});

export const MEDICAL_DISCLAIMER =
  "Descargo de responsabilidad médica: este test es orientativo y no sustituye un diagnóstico clínico profesional realizado por un especialista en salud visual.";

function buildInvalidEnvironmentResult(totalPlates, nothingSeenCount, skippedCount) {
  return {
    controlPassed: false,
    totalPlates,
    evaluatedPlates: 0,
    correctCount: 0,
    incorrectCount: 0,
    nothingSeenCount,
    skippedCount,
    validPercentage: 0,
    badge: "Prueba detenida por control",
    icon: "!",
    title: "Condiciones de pantalla no válidas",
    message:
      "No se superó la lámina de control inicial. Revisa el brillo de tu pantalla, desactiva filtros nocturnos o de luz azul y vuelve a intentarlo.",
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

export function evaluateTest(plates, answersById) {
  const safeAnswers = answersById && typeof answersById === "object" ? answersById : {};
  const controlPlates = plates.filter((plate) => plate.kind === "control");
  const rgPlates = plates.filter((plate) => plate.kind === "red-green");

  for (const controlPlate of controlPlates) {
    const answer = safeAnswers[controlPlate.id];
    if (!answer || answer !== controlPlate.expected) {
      const nothingSeenCount = answer === "nothing_seen" ? 1 : 0;
      const skippedCount = answer === "skipped" ? 1 : 0;
      const base = buildInvalidEnvironmentResult(plates.length, nothingSeenCount, skippedCount);
      return { ...base, status: "invalid_environment", classification: "invalid_environment" };
    }
  }

  let correctCount = 0;
  let incorrectCount = 0;
  let nothingSeenCount = 0;
  let skippedCount = 0;

  for (const plate of rgPlates) {
    const answer = safeAnswers[plate.id];
    if (!answer || answer === "skipped") {
      skippedCount += 1;
    } else if (answer === "nothing_seen") {
      nothingSeenCount += 1;
    } else if (answer === plate.expected) {
      correctCount += 1;
    } else {
      incorrectCount += 1;
    }
  }

  const evaluatedPlates = rgPlates.length - skippedCount;
  const maxAllowedSkips = Math.floor(rgPlates.length / 3);

  if (evaluatedPlates <= 0 || skippedCount > maxAllowedSkips) {
    return {
      status: "inconclusive",
      classification: "inconclusive",
      controlPassed: true,
      totalPlates: plates.length,
      evaluatedPlates,
      correctCount,
      incorrectCount,
      nothingSeenCount,
      skippedCount,
      validPercentage: 0,
      badge: "Resultado no concluyente",
      icon: "?",
      title: "Evaluación inconclusa por preguntas omitidas",
      message:
        "Se omitieron demasiadas láminas rojo-verde para ofrecer una orientación fiable. Repite el test respondiendo al menos 6 láminas cromáticas.",
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  const validPercentage = Math.round((correctCount / evaluatedPlates) * 100);
  const isNormal = validPercentage >= 75;

  if (isNormal) {
    return {
      status: "normal_indication",
      classification: "normal_indication",
      controlPassed: true,
      totalPlates: plates.length,
      evaluatedPlates,
      correctCount,
      incorrectCount,
      nothingSeenCount,
      skippedCount,
      validPercentage,
      badge: "Indicador orientativo normal",
      icon: "✓",
      title: "Discriminación rojo-verde dentro del rango esperado",
      message:
        "Tus respuestas en las láminas rojo-verde coinciden con una percepción cromática estándar en esta prueba rápida.",
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  return {
    status: "possible_red_green_deficiency",
    classification: "possible_red_green_deficiency",
    controlPassed: true,
    totalPlates: plates.length,
    evaluatedPlates,
    correctCount,
    incorrectCount,
    nothingSeenCount,
    skippedCount,
    validPercentage,
    badge: "Posible alteración rojo-verde",
    icon: "i",
    title: "Posible dificultad en la discriminación rojo-verde",
    message:
      "Se detectaron respuestas discordantes o ausencia de figura percibida en varias láminas rojo-verde. Se recomienda valoración optométrica u oftalmológica.",
    disclaimer: MEDICAL_DISCLAIMER,
  };
}
