/** Ball diameter scale calibration from address frame. */

import { GOLF_BALL_DIAMETER_MM } from './constants';
import type { ScaleCalibration } from './types';
import type { SampledFrame } from './frames';
import { estimateBallPixelDiameter, findStaticBallBlob } from './track';

export function calibrateScale(
  preImpactFrames: SampledFrame[],
): ScaleCalibration | null {
  for (const frame of preImpactFrames) {
    const blob = findStaticBallBlob(frame);
    if (!blob) continue;

    const ballPixelDiameter = estimateBallPixelDiameter(blob);
    if (ballPixelDiameter < 4 || ballPixelDiameter > 120) continue;

    const mmPerPixel = GOLF_BALL_DIAMETER_MM / ballPixelDiameter;
    return {
      mmPerPixel,
      ballPixelDiameter,
      confidence: 'uncalibrated',
      assumptions: [
        `Ball diameter assumed ${GOLF_BALL_DIAMETER_MM} mm (USGA standard).`,
        'Scale derived from pre-impact ball detection — perspective error not fully corrected.',
        'Single-camera depth change during flight may bias speed.',
      ],
    };
  }
  return null;
}
