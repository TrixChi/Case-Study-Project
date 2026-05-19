import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  onEdit?: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
  editTitle?: string;
  deleteTitle?: string;
}

export default function ActionButtons({ onEdit, onDelete, showDelete = true, editTitle = 'Edit', deleteTitle = 'Delete' }: Props) {
  return (
    <div className="table-action-group">
      {onEdit && (
        <button onClick={onEdit} className="icon-btn icon-btn--edit" title={editTitle}>
          <Pencil className="w-4 h-4" />
        </button>
      )}
      {onDelete && showDelete && (
        <button onClick={onDelete} className="icon-btn icon-btn--danger" title={deleteTitle}>
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
