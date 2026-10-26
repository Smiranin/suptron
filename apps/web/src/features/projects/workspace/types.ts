import type { usePathStatuses } from '../ProfileForm';
import type { ProfileFormHandle } from '../profile-form-model';

export interface WorkspaceFieldsProps {
  form: ProfileFormHandle;
  paths: ReturnType<typeof usePathStatuses>;
  /** The id prefix of the form, for labels. */
  id: string;
}
