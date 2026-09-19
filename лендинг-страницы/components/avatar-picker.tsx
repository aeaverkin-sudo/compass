"use client";

import { LANDING_PHOTO_SIZE_PX, photoRadiusForSize, PhotoSlotPicker } from "./photo-slot-picker";

type AvatarPickerProps = {
  photo: string | null;
  onPhotoChange: (photo: string | null) => void;
};

export function AvatarPicker({ photo, onPhotoChange }: AvatarPickerProps) {
  return (
    <PhotoSlotPicker
      photo={photo}
      onPhotoChange={onPhotoChange}
      sizePx={LANDING_PHOTO_SIZE_PX}
      borderRadiusPx={photoRadiusForSize(LANDING_PHOTO_SIZE_PX)}
      surfaceClassName="bg-background"
    />
  );
}
