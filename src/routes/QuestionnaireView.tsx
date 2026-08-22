import { useNavigate, useLocation } from 'react-router-dom';
import { PlayerQuestionnaire } from '../components/profile/PlayerQuestionnaire';
import type { StepId } from '../components/profile/PlayerQuestionnaire';

export function QuestionnaireView() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialStep =
    (location.state as { initialStep?: StepId } | null)?.initialStep ?? 'game';

  return (
    <div className="mx-auto max-w-xl">
      <PlayerQuestionnaire
        initialStep={initialStep}
        onComplete={() => navigate('/today', { replace: true })}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
