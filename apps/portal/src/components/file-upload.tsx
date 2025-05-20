'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, File, X, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Progress } from './ui/progress'
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE, formatFileSize } from '@/lib/file-utils'

interface FileUploadProps {
  onFileUpload?: (file: File) => Promise<void>
  onUploadComplete?: (response: Record<string, unknown>) => void
  vendorId?: string
  productType?: string
  accept?: Record<string, string[]>
  maxSize?: number
  className?: string
}

export function FileUpload({
  onFileUpload,
  onUploadComplete,
  vendorId,
  productType,
  accept = ACCEPTED_FILE_TYPES,
  maxSize = MAX_FILE_SIZE,
  className,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [fileError, setFileError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setFileError(null)
      const file = acceptedFiles[0]
      
      if (!file) {
        setFileError('Unsupported file type')
        return
      }

      if (file.size > maxSize) {
        setFileError(`File size exceeds ${formatFileSize(maxSize)}`)
        return
      }

      setSelectedFile(file)
    },
    [maxSize]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    maxSize,
  })

  // Function to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data URL prefix (e.g., 'data:application/pdf;base64,')
          const base64String = reader.result.split(',')[1]
          resolve(base64String)
        } else {
          reject(new Error('Failed to convert file to base64'))
        }
      }
      reader.onerror = error => reject(error)
    })
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      setIsUploading(true)
      setUploadProgress(0)
      
      // Start progress animation
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval)
            return 90
          }
          return prev + 10
        })
      }, 300)

      // If custom upload handler is provided, use it
      if (onFileUpload) {
        await onFileUpload(selectedFile)
      } else {
        // Convert file to base64
        const fileBase64 = await fileToBase64(selectedFile)
        
        // Prepare the payload
        const payload = {
          filename: selectedFile.name,
          fileBase64,
          vendorId,
          productType
        }
        
        // Send to API
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Upload failed')
        }
        
        const result = await response.json()
        
        // Call the completion callback if provided
        if (onUploadComplete) {
          onUploadComplete(result)
        }
      }
      
      // Complete the progress bar
      clearInterval(interval)
      setUploadProgress(100)
      
      // Reset after successful upload
      setTimeout(() => {
        setSelectedFile(null)
        setUploadProgress(0)
      }, 1000)
    } catch (error) {
      setFileError('Error uploading file. Please try again.')
      console.error('Upload error:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    setFileError(null)
    setUploadProgress(0)
  }

  return (
    <div className={className}>
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/60 transition-colors"
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center space-y-2">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {isDragActive ? (
                <p>Drop the file here</p>
              ) : (
                <p>
                  Drag & drop a file here, or click to select
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Supported formats: .xlsx, .xls, .csv, .json (max {formatFileSize(maxSize)})
            </p>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <File className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={removeFile}
                disabled={isUploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {fileError && (
              <p className="mt-2 text-sm text-destructive">{fileError}</p>
            )}

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload File'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
