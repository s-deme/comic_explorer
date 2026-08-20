export type ImageTransformAction =
  | "rotateClockwise"
  | "flipHorizontal"
  | "flipVertical"
  | "reset";

export interface ViewerImageTransform {
  quarterTurns: 0 | 1 | 2 | 3;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export const IDENTITY_IMAGE_TRANSFORM: ViewerImageTransform = {
  quarterTurns: 0,
  flipHorizontal: false,
  flipVertical: false,
};

export function applyViewerImageTransform(
  current: ViewerImageTransform,
  action: ImageTransformAction,
): ViewerImageTransform {
  switch (action) {
    case "rotateClockwise":
      return {
        ...current,
        quarterTurns: ((current.quarterTurns + 1) % 4) as ViewerImageTransform["quarterTurns"],
      };
    case "flipHorizontal":
      return { ...current, flipHorizontal: !current.flipHorizontal };
    case "flipVertical":
      return { ...current, flipVertical: !current.flipVertical };
    case "reset":
      return { ...IDENTITY_IMAGE_TRANSFORM };
  }
}

export function isIdentityImageTransform(transform: ViewerImageTransform): boolean {
  return transform.quarterTurns === 0
    && !transform.flipHorizontal
    && !transform.flipVertical;
}

export function transformedImageSize(
  size: { width: number; height: number },
  transform: ViewerImageTransform,
): { width: number; height: number } {
  return transform.quarterTurns % 2 === 0
    ? size
    : { width: size.height, height: size.width };
}

export function imageTransformCss(transform: ViewerImageTransform): string {
  const horizontal = transform.flipHorizontal ? -1 : 1;
  const vertical = transform.flipVertical ? -1 : 1;
  return `scaleX(${horizontal}) scaleY(${vertical}) rotate(${transform.quarterTurns * 90}deg)`;
}
