'use client'

import { useState } from 'react'
import { Loader2, Upload, FileText, Table, Database, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

export default function DocumentsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [tariff, setTariff] = useState<any>(null)
  const [dbResult, setDbResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('text')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    setError(null)
    setResult(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file to upload')
      return
    }

    try {
      setIsUploading(true)
      setIsAnalyzing(true)
      setError(null)
      setTariff(null)
      setDbResult(null)

      // Create form data
      const formData = new FormData()
      formData.append('file', file)

      // Send to API
      const response = await fetch('/api/document/analyze', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to analyze document')
      }

      const data = await response.json()
      setResult(data.result)
      
      // Set tariff and database result if available
      if (data.tariff) {
        setTariff(data.tariff)
        setActiveTab('tariff') // Switch to tariff tab if tariff data is available
      }
      
      if (data.dbResult) {
        setDbResult(data.dbResult)
      }
    } catch (error) {
      console.error('Error analyzing document:', error)
      setError((error as Error).message || 'An error occurred while analyzing the document')
    } finally {
      setIsUploading(false)
      setIsAnalyzing(false)
    }
  }

  const renderTables = () => {
    if (!result || !result.tables || result.tables.length === 0) {
      return <p className="text-muted-foreground">No tables found in the document.</p>
    }

    return result.tables.map((table: any, tableIndex: number) => (
      <div key={tableIndex} className="mb-8 overflow-x-auto">
        <h3 className="text-lg font-medium mb-2">Table {tableIndex + 1}</h3>
        <div className="border rounded-md">
          <table className="w-full">
            <tbody>
              {Array.from({ length: table.rowCount }).map((_, rowIndex) => (
                <tr key={rowIndex} className="border-b last:border-b-0">
                  {Array.from({ length: table.columnCount }).map((_, colIndex) => {
                    const cell = table.cells.find(
                      (c: any) => c.rowIndex === rowIndex && c.columnIndex === colIndex
                    )
                    return (
                      <td
                        key={colIndex}
                        className="p-2 border-r last:border-r-0"
                        rowSpan={cell?.rowSpan || 1}
                        colSpan={cell?.columnSpan || 1}
                      >
                        {cell?.content || ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ))
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Document Analysis</CardTitle>
          <CardDescription>
            Upload a document to extract text, tables, and other information using Azure Document Intelligence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={handleFileChange}
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {file ? file.name : 'Click to upload or drag and drop'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, JPG, PNG, DOCX up to 4MB
                </p>
              </label>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={!file || isUploading || isAnalyzing}
              className="w-full"
            >
              {isUploading || isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isUploading ? 'Uploading...' : 'Analyzing...'}
                </>
              ) : (
                'Analyze Document'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text">
                  <FileText className="h-4 w-4 mr-2" />
                  Text Content
                </TabsTrigger>
                <TabsTrigger value="tables">
                  <Table className="h-4 w-4 mr-2" />
                  Tables
                </TabsTrigger>
                <TabsTrigger value="tariff" disabled={!tariff}>
                  <Database className="h-4 w-4 mr-2" />
                  Tariff Data
                </TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="mt-4">
                <ScrollArea className="h-[400px] rounded-md border p-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {result.content || 'No text content found.'}
                  </pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="tables" className="mt-4">
                <ScrollArea className="h-[400px] rounded-md border p-4">
                  {renderTables()}
                </ScrollArea>
              </TabsContent>
              <TabsContent value="tariff" className="mt-4">
              {tariff ? (
                <div className="space-y-6">
                  {dbResult && (
                    <Alert variant={dbResult.success ? "default" : "destructive"}>
                      <div className="flex items-center gap-2">
                        {dbResult.success ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <AlertTitle>{dbResult.success ? "Success" : "Error"}</AlertTitle>
                      </div>
                      <AlertDescription>{dbResult.message}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          Hotel Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Hotel Name</dt>
                            <dd className="text-sm">{tariff.hotelName}</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Vendor</dt>
                            <dd className="text-sm">{tariff.vendor}</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">City</dt>
                            <dd className="text-sm">{tariff.city}</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Category</dt>
                            <dd className="text-sm">
                              <Badge variant="secondary">{tariff.category}</Badge>
                            </dd>
                          </div>
                        </dl>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          Rate Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Base Rate</dt>
                            <dd className="text-sm">₹{tariff.baseRate.toFixed(2)}</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">GST</dt>
                            <dd className="text-sm">{tariff.gstPercent}%</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Service Fee</dt>
                            <dd className="text-sm">₹{tariff.serviceFee.toFixed(2)}</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Meal Plan</dt>
                            <dd className="text-sm">{tariff.mealPlan}</dd>
                          </div>
                        </dl>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          Season & Dates
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Season</dt>
                            <dd className="text-sm">
                              <Badge variant="outline">{tariff.season}</Badge>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Valid From</dt>
                            <dd className="text-sm">{new Date(tariff.startDate).toLocaleDateString()}</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-muted-foreground">Valid To</dt>
                            <dd className="text-sm">{new Date(tariff.endDate).toLocaleDateString()}</dd>
                          </div>
                        </dl>
                      </CardContent>
                    </Card>
                    
                    {tariff.description && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            Additional Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm">{tariff.description}</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[400px]">
                  <p className="text-muted-foreground">No tariff information extracted from this document.</p>
                </div>
              )}
            </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
