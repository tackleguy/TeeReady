import { useNavigate, useLocation } from 'react-router-dom';
import { PlayerQuestionnaire } from '../components/profile/PlayerQuestionnaire';
import type { StepId } from '../components/profile/PlayerQuestionnaire';
import { useAuth } from '../lib/auth';
import { upsertCloudProfile } from '../lib/accountProfile';

export function QuestionnaireView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const initialStep =
    (location.state as { initialStep?: StepId } | null)?.initialStep ?? 'game';

  return (
    <div className="mx-auto max-w-xl">
      <PlayerQuestionnaire
        initialStep={initialStep}
        onComplete={async () => {
          if (user?.id) {
            try {
              await upsertCloudProfile(user.id);
            } catch {
              // Local save already succeeded; cloud can catch up next sync.
            }
          }
          navigate('/profile', { replace: true });
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
