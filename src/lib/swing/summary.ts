/** Plain rule-based summary from measured metrics (no AI). */

import { SWING_THRESHOLDS } from './thresholds';
import type { CameraAngle, SwingMetric } from './types';

function find(metrics: SwingMetric[], id: string): SwingMetric | undefined {
  return metrics.find((m) => m.id === id);
}

function noteConfidence(m: SwingMetric): string {
  if (m.confidence === 'low') {
    return ` (uncertain at ${Math.round(m.validAtFps)}+ fps needed — this clip is below that)`;
  }
  return '';
}

export function buildRuleSummary(
  metrics: SwingMetric[],
  angle: CameraAngle,
  fps: number,
): string {
  const parts: string[] = [];
  const t = SWING_THRESHOLDS;

  if (fps < t.warnBelowFps) {
    parts.push(
      `Recorded at ~${Math.round(fps)} fps — impact-position numbers are unreliable below ${t.warnBelowFps} fps.`,
    );
  }

  if (angle === 'face-on') {
    const head = find(metrics, 'head_lateral');
    const sway = find(metrics, 'hip_sway');
    const tempo = find(metrics, 'tempo_ratio');
    const arm = find(metrics, 'lead_arm_p4');

    if (head) {
      if (head.confidence === 'low') {
        parts.push(`Head stability at impact${noteConfidence(head)}.`);
      } else if (head.value <= t.faceOn.headLateralGood) {
        parts.push('Head stayed quiet through impact — solid face-on stability.');
      } else if (head.value <= t.faceOn.headLateralWarn) {
        parts.push(
          `Some head sway (${head.value} shoulder widths). Keep the nose over a fixed spot on the ground.`,
        );
      } else {
        parts.push(
          `Head moved a lot laterally (${head.value} shoulder widths). That’s usually costing centre-face contact.`,
        );
      }
    }

    if (sway && sway.confidence === 'high') {
      if (sway.value <= t.faceOn.hipSwayGood) {
        parts.push('Hips stayed centred at the top.');
      } else if (sway.value <= t.faceOn.hipSwayWarn) {
        parts.push('Mild hip sway at the top — feel pressure into the trail heel going back.');
      } else {
        parts.push(
          'Notable hip sway at the top. Limit lateral drift; load into the trail hip instead of sliding.',
        );
      }
    }

    if (tempo && tempo.confidence === 'high') {
      const ideal = t.faceOn.tempoIdeal;
      if (Math.abs(tempo.value - ideal) <= t.faceOn.tempoTol) {
        parts.push(`Tempo is near the classic ${ideal}:1 backswing-to-downswing feel.`);
      } else if (tempo.value < ideal - t.faceOn.tempoTol) {
        parts.push(
          `Quick transition (tempo ${tempo.value}:1). Smooth the takeaway so the downswing isn’t a rush.`,
        );
      } else {
        parts.push(
          `Long backswing relative to the downswing (${tempo.value}:1). Shorten the backswing or start down a beat sooner.`,
        );
      }
    }

    if (arm && arm.confidence === 'high') {
      if (arm.value >= t.faceOn.leadArmFoldIdeal - 20) {
        parts.push('Lead arm is wide at the top — good width.');
      } else if (arm.value < t.faceOn.leadArmFoldMin) {
        parts.push(
          'Lead arm is quite bent at the top. Feel a longer left arm (for a righty) without locking the elbow.',
        );
      }
    }
  } else {
    const spine = find(metrics, 'spine_address');
    const early = find(metrics, 'early_extension');
    const shoulder = find(metrics, 'shoulder_turn_p4');
    const xFactor = find(metrics, 'x_factor');

    if (spine && spine.confidence === 'high') {
      const delta = Math.abs(spine.value - t.dtl.spineAddressIdeal);
      if (delta <= t.dtl.spineAddressTol) {
        parts.push(`Address posture looks athletic (~${spine.value}° spine tilt).`);
      } else if (spine.value < t.dtl.spineAddressIdeal - t.dtl.spineAddressTol) {
        parts.push(
          `You’re a bit upright at address (${spine.value}°). Hinge from the hips until arms hang naturally.`,
        );
      } else {
        parts.push(
          `Deep bend at address (${spine.value}°). Soften the knee flex and lift the chest slightly.`,
        );
      }
    }

    if (early) {
      if (early.confidence === 'low') {
        parts.push(`Early-extension read${noteConfidence(early)}.`);
      } else if (early.value >= t.dtl.earlyExtBad) {
        parts.push(
          `Clear early extension (${early.value}° spine stand-up into impact). Keep the trail glute back through the strike.`,
        );
      } else if (early.value >= t.dtl.earlyExtWarn) {
        parts.push(
          `Mild early extension (${early.value}°). Feel like you stay in posture a hair longer into the ball.`,
        );
      } else {
        parts.push('You held posture well into impact — no early extension spike.');
      }
    }

    if (shoulder && shoulder.confidence === 'high') {
      if (shoulder.value >= t.dtl.shoulderTurnIdeal - 10) {
        parts.push(`Full shoulder turn at the top (~${shoulder.value}°).`);
      } else if (shoulder.value < t.dtl.shoulderTurnMin) {
        parts.push(
          `Short shoulder turn (${shoulder.value}°). Turn the trail shoulder behind you without swaying.`,
        );
      }
    }

    if (xFactor && xFactor.confidence === 'high') {
      if (xFactor.value >= t.dtl.xFactorMin) {
        parts.push(`X-factor ~${xFactor.value}° — useful coil between shoulders and hips.`);
      } else {
        parts.push(
          `Small X-factor (${xFactor.value}°). Let the shoulders out-turn the hips a bit more at the top.`,
        );
      }
    }
  }

  if (parts.length === 0) {
    return 'Swing positions were found, but there isn’t enough high-confidence signal for a coaching summary. Re-record with more frames at 30+ fps when possible.';
  }

  return parts.join(' ');
}
