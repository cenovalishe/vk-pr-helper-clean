// FILE: packages/web/src/modules/images/ImageUploader.tsx
// VERSION: 3.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Upload button and preview grid component rendering 6 slots matching Screenshot_28
//   SCOPE: Presentational UI for Step 3 of form
//   DEPENDS: react, @vkontakte/icons, ../ui-core, ./useImageStore
//   LINKS: M-IMAGES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ImageUploader - React component rendering 6 upload/preview slots in a grid
// END_MODULE_MAP
 
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.3.0 - Add loading indicator, spinner styling and disable upload input during compression/upload]
//   PREVIOUS_CHANGES:
//     - [v3.2.0 - Update upload button text to "Загрузить" per user request]
//     - [v3.1.0 - Make handleFileChange async to support asynchronous image compression]
// END_CHANGE_SUMMARY

import React, { useRef } from 'react';
import { Icon28UploadOutline } from '@vkontakte/icons';
import { useImageStore, MAX_IMAGES } from './useImageStore';
import { DashedBox } from '../ui-core';
import { createLogger } from '../../shared/logger';
import { useIsMobile } from '../adaptive';
import './images.css';

const logger = createLogger('Images');

export const ImageUploader: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { images, isUploading, addImages, removeImage, moveLeft, moveRight, clear } = useImageStore();
  const isMobile = useIsMobile();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      const { errors } = await addImages(filesArray);
      
      if (errors.length > 0) {
        logger.warn('ImageUploader', 'BLOCK_IMAGE_UPLOAD', 'Upload errors occurred', { errors });
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // START_CHANGE_SUMMARY
  //   LAST_CHANGE: [v4.1.0 - Phase-MOBILE-ADAPT: Add bottom safe-area margin and touch target sizes for mobile buttons]
  // END_CHANGE_SUMMARY

  const slots = [];

  // 1. Add preview slots for uploaded images
  images.forEach((img, index) => {
    slots.push(
      <div key={img.id} className="image-slot image-preview-slot" data-testid={`preview-${img.id}`}>
        <img src={img.previewUrl} alt={`Preview ${index}`} className="image-slot__img" />
        
        <button 
          type="button" 
          className="image-slot__delete"
          onClick={() => removeImage(img.id)}
          aria-label="Delete image"
          style={isMobile ? { width: '26px', height: '26px', fontSize: '16px' } : undefined}
        >
          ×
        </button>
        
        <div 
          className="image-slot__actions"
          style={isMobile ? { padding: '4px 6px' } : undefined}
        >
          <button 
            type="button"
            className="image-slot__move-btn"
            onClick={() => moveLeft(img.id)}
            disabled={index === 0}
            aria-label="Move left"
            style={isMobile ? { height: '24px', minWidth: '24px', fontSize: '14px' } : undefined}
          >
            ←
          </button>
          <button 
            type="button"
            className="image-slot__move-btn"
            onClick={() => moveRight(img.id)}
            disabled={index === images.length - 1}
            aria-label="Move right"
            style={isMobile ? { height: '24px', minWidth: '24px', fontSize: '14px' } : undefined}
          >
            →
          </button>
        </div>
      </div>
    );
  });

  // 2. Add the upload button slot if we haven't reached the limit
  if (images.length < MAX_IMAGES) {
    slots.push(
      <div 
        key="upload-slot" 
        className={`image-slot image-upload-slot ${isUploading ? 'image-upload-slot--loading' : ''}`}
        onClick={isUploading ? undefined : handleButtonClick}
        data-testid="upload-slot-btn"
      >
        <div className="image-upload-slot__content">
          <span className="image-upload-slot__text">
            {isUploading ? 'Загрузка...' : 'Загрузить'}
          </span>
          {isUploading ? (
            <div className="image-upload-slot__spinner" data-testid="upload-spinner" />
          ) : (
            <Icon28UploadOutline className="image-upload-slot__icon" />
          )}
        </div>
      </div>
    );
  }

  // 3. Add empty dashed placeholder slots for the rest of the 6 slots
  const emptySlotsCount = MAX_IMAGES - slots.length;
  for (let i = 0; i < emptySlotsCount; i++) {
    slots.push(
      <DashedBox key={`empty-slot-${i}`} className="image-slot image-empty-slot" />
    );
  }

  return (
    <div 
      className="image-uploader"
      style={isMobile ? { marginBottom: 'var(--safe-area-inset-bottom, 0px)' } : undefined}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="image-uploader__input"
        accept="image/*"
        multiple
        disabled={isUploading}
        onChange={handleFileChange}
        data-testid="file-upload-input"
        style={{ display: 'none' }}
      />
      <div className="image-uploader__grid" data-testid="image-previews">
        {slots}
      </div>
    </div>
  );
};
