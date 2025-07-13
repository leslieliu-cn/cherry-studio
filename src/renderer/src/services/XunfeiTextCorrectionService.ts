// 文本纠错服务配置
interface TextCorrectionConfig {
  apiUrl: string
  maxLength: number
  authToken?: string
}

// 检测结果接口
export interface TextCorrectionResult {
  success: boolean
  originalText: string
  correctedText?: string
  corrections?: Array<{
    original: string
    corrected: string
    position: number
    type: string
    confidence: number
    description: string
  }>
  message?: string
}

class XunfeiTextCorrectionService {
  private config: TextCorrectionConfig

  constructor() {
    this.config = {
      apiUrl: 'https://xfyun.htianxia.com/api/text-correction/check-texts',
      maxLength: 2000,
      authToken: '5f56ed6fdb0493ecef90f9e5'
    }
  }

  /**
   * 将文本按照空格、标点符号或段落分割为数组，每段不超过指定长度
   */
  private splitText(text: string, maxLength: number = this.config.maxLength): string[] {
    if (text.length <= maxLength) {
      return [text]
    }

    const chunks: string[] = []

    // 首先按段落分割（换行符）
    const paragraphs = text.split(/\n+/)

    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxLength) {
        chunks.push(paragraph)
      } else {
        // 如果段落太长，按句子分割（句号、问号、感叹号）
        const sentences = paragraph.split(/([。！？.!?]+)/)
        let currentChunk = ''

        for (let i = 0; i < sentences.length; i += 2) {
          const sentence = sentences[i] + (sentences[i + 1] || '')

          if ((currentChunk + sentence).length <= maxLength) {
            currentChunk += sentence
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim())
              currentChunk = sentence
            } else {
              // 如果单个句子就超过长度，按逗号分割
              const parts = sentence.split(/([，,;；]+)/)
              let subChunk = ''

              for (let j = 0; j < parts.length; j += 2) {
                const part = parts[j] + (parts[j + 1] || '')

                if ((subChunk + part).length <= maxLength) {
                  subChunk += part
                } else {
                  if (subChunk) {
                    chunks.push(subChunk.trim())
                    subChunk = part
                  } else {
                    // 最后按空格分割
                    const words = part.split(/\s+/)
                    let wordChunk = ''

                    for (const word of words) {
                      if ((wordChunk + ' ' + word).length <= maxLength) {
                        wordChunk += (wordChunk ? ' ' : '') + word
                      } else {
                        if (wordChunk) {
                          chunks.push(wordChunk.trim())
                          wordChunk = word
                        } else {
                          // 如果单个词都超过长度，强制截断
                          chunks.push(word.substring(0, maxLength))
                          if (word.length > maxLength) {
                            wordChunk = word.substring(maxLength)
                          }
                        }
                      }
                    }

                    if (wordChunk) {
                      subChunk = wordChunk
                    }
                  }
                }
              }

              if (subChunk) {
                currentChunk = subChunk
              }
            }
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk.trim())
        }
      }
    }

    return chunks.filter((chunk) => chunk.trim().length > 0)
  }

  /**
   * 合并多个检测结果
   */
  private mergeResults(
    originalText: string,
    results: TextCorrectionResult[],
    textChunks: string[]
  ): TextCorrectionResult {
    const allCorrections: Array<{
      original: string
      corrected: string
      position: number
      type: string
      confidence: number
      description: string
    }> = []

    let correctedText = originalText
    let currentPosition = 0
    let hasErrors = false

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const chunk = textChunks[i]

      if (!result.success) {
        hasErrors = true
        continue
      }

      if (result.corrections && result.corrections.length > 0) {
        // 调整位置偏移
        const adjustedCorrections = result.corrections.map((correction) => ({
          ...correction,
          position: correction.position + currentPosition
        }))

        allCorrections.push(...adjustedCorrections)
      }

      // 更新当前位置
      currentPosition += chunk.length + 1 // +1 for potential separator
    }

    // 应用所有修正
    if (allCorrections.length > 0) {
      // 按位置倒序排列，从后往前替换，避免位置偏移
      const sortedCorrections = allCorrections.sort((a, b) => b.position - a.position)

      for (const correction of sortedCorrections) {
        const start = correction.position
        const end = start + correction.original.length
        if (start >= 0 && end <= correctedText.length) {
          correctedText = correctedText.substring(0, start) + correction.corrected + correctedText.substring(end)
        }
      }
    }

    return {
      success: !hasErrors,
      originalText,
      correctedText: allCorrections.length > 0 ? correctedText : originalText,
      corrections: allCorrections,
      message: hasErrors
        ? '部分文本检测失败'
        : allCorrections.length > 0
          ? '发现需要修正的内容'
          : '未发现明显的敏感词汇或不当表达'
    }
  }

  /**
   * 调用文本纠错API
   */
  async checkText(text: string): Promise<TextCorrectionResult> {
    try {
      if (!text.trim()) {
        return {
          success: false,
          originalText: text,
          message: '文本内容不能为空'
        }
      }

      // 将文本分割为多个片段
      const textChunks = this.splitText(text)

      // 调用外部API接口，发送文本数组
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      // 如果有认证token，添加Authorization头部
      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`
      }

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ texts: textChunks })
      })

      if (!response.ok) {
        let errorMessage = `HTTP错误: ${response.status} ${response.statusText}`
        try {
          const errorData = await response.json()
          if (errorData.error || errorData.message) {
            errorMessage = errorData.error || errorData.message
          }
        } catch {
          // 如果无法解析错误响应，使用默认错误消息
        }
        throw new Error(errorMessage)
      }

      const responseData = await response.json()

      // 检查响应格式
      if (!responseData) {
        throw new Error('API返回空响应')
      }

      // 如果API直接返回数组
      let results: TextCorrectionResult[]
      if (Array.isArray(responseData)) {
        results = responseData
      } else if (responseData.results && Array.isArray(responseData.results)) {
        // 如果API返回包装的对象
        results = responseData.results
      } else if (responseData.data && Array.isArray(responseData.data)) {
        // 另一种可能的包装格式
        results = responseData.data
      } else {
        throw new Error('API返回的数据格式不正确')
      }

      if (!results || results.length === 0) {
        return {
          success: false,
          originalText: text,
          message: '未收到有效的检测结果'
        }
      }

      // 验证结果数量是否匹配
      if (results.length !== textChunks.length) {
        console.warn(`API返回的结果数量(${results.length})与发送的文本片段数量(${textChunks.length})不匹配`)
      }

      // 合并所有结果
      return this.mergeResults(text, results, textChunks)
    } catch (error) {
      console.error('文本纠错API调用失败:', error)
      return {
        success: false,
        originalText: text,
        message: error instanceof Error ? error.message : '检测服务暂时不可用'
      }
    }
  }

  /**
   * 格式化检测结果为用户友好的文本
   */
  formatResult(result: TextCorrectionResult): string {
    console.log(result, 'result formatResult')
    if (!result.success) {
      return `检测失败: ${result.message}`
    }

    if (!result.corrections || result.corrections.length === 0) {
      return result.message || '未发现明显的敏感词汇或不当表达。'
    }

    let output = '发现以下需要注意的内容:\n\n'

    result.corrections.forEach((correction, index) => {
      output += `${index + 1}. **${correction.description}**: "${correction.original}"\n`
      output += `   建议修改为: "${correction.corrected}"\n`
      if (correction.confidence) {
        output += `   置信度: ${(correction.confidence * 100).toFixed(1)}%\n`
      }
      output += '\n'
    })

    if (result.correctedText && result.correctedText !== result.originalText) {
      output += '**修正后的完整文本:**\n'
      output += result.correctedText
    }

    return output
  }
}

// 导出类供用户创建实例
export { XunfeiTextCorrectionService }

// 导出默认实例（无认证token）
export default new XunfeiTextCorrectionService()
