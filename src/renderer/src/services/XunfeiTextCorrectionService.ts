// 使用Web Crypto API替代Node.js crypto模块

// 讯飞文本纠错API配置
interface XunfeiConfig {
  appid: string
  apisecret: string
  apikey: string
  url: string
  maxLength: number
}

// API响应接口
interface XunfeiResponse {
  code: number
  message: string
  sid: string
  header: {
    code: number
    message: string
    sid: string
    status: number
  }
  payload?: {
    result: {
      text: string // Base64编码的JSON字符串
    }
  }
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
  private config: XunfeiConfig

  constructor() {
    this.config = {
      appid: 'cdd271ea',
      apisecret: 'ZTI3M2M5OGEzZGIyMDE3NTRkMjRiYTFl',
      apikey: '0d157c977578dc087cc98f505ffba070',
      url: 'https://api.xf-yun.com/v1/private/s9a87e3ec',
      maxLength: 2000
    }
  }

  /**
   * 生成讯飞API所需的认证URL
   */
  private async generateAuthUrl(method: string, baseUrl: string): Promise<string> {
    const parsedUrl = new URL(baseUrl)
    const host = parsedUrl.host
    const path = parsedUrl.pathname

    // 生成RFC1123格式的日期
    const now = new Date()
    const date = now.toUTCString()

    // 构建签名字符串 - 注意格式要严格按照讯飞要求
    const signatureOrigin = `host: ${host}\ndate: ${date}\n${method.toUpperCase()} ${path} HTTP/1.1`

    // 使用Web Crypto API生成HMAC-SHA256签名
    const encoder = new TextEncoder()
    const keyData = encoder.encode(this.config.apisecret)
    const messageData = encoder.encode(signatureOrigin)

    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const signatureSha = this.arrayBufferToBase64(signatureBuffer)

    // 构建authorization原始字符串
    const authorizationOrigin = `api_key="${this.config.apikey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`
    const authorization = btoa(authorizationOrigin)

    // 构建URL参数
    const params = new URLSearchParams({
      host: host,
      date: date,
      authorization: authorization
    })

    return `${baseUrl}?${params.toString()}`
  }

  /**
   * 将ArrayBuffer转换为Base64字符串
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * 正确解码包含中文字符的Base64字符串
   */
  private base64DecodeUTF8(base64: string): string {
    try {
      // 使用atob解码Base64
      const binaryString = atob(base64)

      // 将二进制字符串转换为字节数组
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // 使用TextDecoder正确解码UTF-8
      const decoder = new TextDecoder('utf-8')
      return decoder.decode(bytes)
    } catch (error) {
      console.error('Base64解码失败:', error)
      // 如果解码失败，尝试直接使用atob
      return atob(base64)
    }
  }

  /**
   * 调用讯飞文本纠错API
   */
  async checkText(text: string): Promise<TextCorrectionResult> {
    try {
      // 检查文本长度
      if (text.length > this.config.maxLength) {
        return {
          success: false,
          originalText: text,
          message: `文本长度超过限制，最大支持${this.config.maxLength}个字符`
        }
      }

      if (!text.trim()) {
        return {
          success: false,
          originalText: text,
          message: '文本内容不能为空'
        }
      }

      // 构建请求体 - 严格按照Python代码格式
      const requestBody = {
        header: {
          app_id: this.config.appid,
          status: 3
        },
        parameter: {
          s9a87e3ec: {
            result: {
              encoding: 'utf8',
              compress: 'raw',
              format: 'json'
            }
          }
        },
        payload: {
          input: {
            encoding: 'utf8',
            compress: 'raw',
            format: 'plain',
            status: 3,
            text: btoa(unescape(encodeURIComponent(text)))
          }
        }
      }

      const bodyString = JSON.stringify(requestBody)
      const authUrl = await this.generateAuthUrl('POST', this.config.url)

      console.log('讯飞API请求参数:', {
        url: authUrl,
        headers: {
          'Content-Type': 'application/json',
          host: 'api.xf-yun.com',
          app_id: this.config.appid
        },
        payload: requestBody
      })

      // 发送请求 - 使用带认证参数的URL，添加必要的请求头
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'api.xf-yun.com',
          app_id: this.config.appid
        },
        body: bodyString
      })

      console.log('讯飞API响应状态:', response.status, response.statusText)

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status} ${response.statusText}`)
      }

      const result: XunfeiResponse = await response.json()
      console.log('讯飞API原始响应数据:', result)

      // 处理API响应
      if (result.header.code !== 0) {
        let errorMessage = result.message || '检测失败'

        // 处理特定错误码
        if (result.header.code === 11201) {
          errorMessage = '讯飞API授权不足：每日调用次数已达上限(500次)，请联系管理员或等待次日重置'
        } else if (result.header.code === 10105) {
          errorMessage = '讯飞API认证失败：请检查AppID、APIKey和APISecret配置是否正确'
        } else if (result.header.code === 10110) {
          errorMessage = '讯飞API授权许可不足：请检查应用授权状态或联系讯飞客服'
        }

        return {
          success: false,
          originalText: text,
          message: errorMessage
        }
      }

      // 根据Python demo，需要解析payload.result.text中的Base64编码数据
      if (!result.payload?.result?.text) {
        console.log('未找到纠错结果，payload结构:', result.payload)
        return {
          success: true,
          originalText: text,
          correctedText: text,
          corrections: [],
          message: '未发现明显的敏感词汇或不当表达'
        }
      }

      console.log('Base64编码的text字段:', result.payload.result.text)

      // 解码Base64编码的结果 - 修复中文乱码问题
      const decodedText = this.base64DecodeUTF8(result.payload.result.text)
      console.log('Base64解码后的文本:', decodedText)

      const correctionResult = JSON.parse(decodedText)
      console.log('解析后的纠错结果:', correctionResult)

      // 解析纠错结果
      const corrections = this.parseCorrections(correctionResult)
      console.log('提取的纠错信息:', corrections)

      const correctedText = this.applyCorrections(text, corrections)
      console.log('修正后的文本:', correctedText)

      return {
        success: true,
        originalText: text,
        correctedText,
        corrections,
        message: corrections.length > 0 ? '发现需要修正的内容' : '未发现明显的敏感词汇或不当表达'
      }
    } catch (error) {
      console.error('讯飞API调用失败:', error)
      console.error('错误详情:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      return {
        success: false,
        originalText: text,
        message: error instanceof Error ? error.message : '检测服务暂时不可用'
      }
    }
  }

  /**
   * 解析讯飞API返回的纠错结果
   */
  private parseCorrections(correctionResult: any): Array<{
    original: string
    corrected: string
    position: number
    type: string
    confidence: number
    description: string
  }> {
    const corrections: Array<{
      original: string
      corrected: string
      position: number
      type: string
      confidence: number
      description: string
    }> = []

    // 根据Python代码中的错误类型处理
    const errorTypes = [
      'black_list',
      'pol',
      'char',
      'word',
      'redund',
      'miss',
      'order',
      'dapei',
      'punc',
      'idm',
      'org',
      'leader',
      'number',
      'addr',
      'name',
      'grammar_pc'
    ]

    for (const errorType of errorTypes) {
      if (correctionResult[errorType] && Array.isArray(correctionResult[errorType])) {
        for (const error of correctionResult[errorType]) {
          if (Array.isArray(error) && error.length >= 4) {
            const pos = error[0] // 错误位置
            const cur = error[1] // 当前错误的词
            const correct = error[2] // 建议修改的词

            corrections.push({
              original: cur,
              corrected: correct,
              position: pos,
              type: errorType,
              confidence: 1.0, // 讯飞API没有置信度，设为1.0
              description: this.getTypeDescription(errorType)
            })
          }
        }
      }
    }

    return corrections
  }

  /**
   * 应用纠错建议生成修正后的文本
   */
  private applyCorrections(
    originalText: string,
    corrections: Array<{
      original: string
      corrected: string
      position: number
      type: string
      confidence: number
      description: string
    }>
  ): string {
    if (corrections.length === 0) {
      return originalText
    }

    // 按位置倒序排列，从后往前替换，避免位置偏移
    const sortedCorrections = corrections.sort((a, b) => b.position - a.position)
    let correctedText = originalText

    for (const correction of sortedCorrections) {
      const start = correction.position
      const end = start + correction.original.length
      if (start >= 0 && end <= correctedText.length) {
        correctedText = correctedText.substring(0, start) + correction.corrected + correctedText.substring(end)
      }
    }

    return correctedText
  }

  /**
   * 获取错误类型的中文描述
   */
  private getTypeDescription(type: string): string {
    const typeMap: Record<string, string> = {
      black_list: '黑名单纠错',
      pol: '政治术语纠错',
      char: '别字纠错',
      word: '别词纠错',
      redund: '语法纠错-冗余',
      miss: '语法纠错-缺失',
      order: '语法纠错-乱序',
      dapei: '搭配纠错',
      punc: '标点纠错',
      idm: '成语纠错',
      org: '机构名纠错',
      leader: '领导人职称纠错',
      number: '数字纠错',
      addr: '地名纠错',
      name: '全文人名纠错',
      grammar_pc: '句式杂糅&语义重复',
      // 兼容旧的类型
      sensitive: '敏感词汇',
      inappropriate: '不当表达',
      offensive: '冒犯性内容',
      political: '政治敏感',
      violence: '暴力内容',
      adult: '成人内容',
      spam: '垃圾信息',
      other: '其他风险内容'
    }
    return typeMap[type] || '未知错误类型'
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

export default new XunfeiTextCorrectionService()
