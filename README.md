# 网页版串口助手（纯前端升级版）

这是一个 **纯前端** 的网页版串口助手，基于 **Web Serial API**，不需要 Python 后端，也不需要数据库，适合本机串口调试与协议解析测试。

## 本次升级内容
- 波特率新增：
  - `1000000`
  - `2000000`
- 支持 **自定义任意波特率**
- 页面布局改为：
  - **左侧小栏**：设置区，可上下滚动
  - **右侧大区域上方**：接收区
  - **右侧下方较矮区域**：发送区
- 控件位置调整：
  - `Hex接收` 放在 **接收区** 标题后
  - `Hex发送` 放在 **发送区** 标题后
  - `导出日志 / 清空日志 / 时间戳 / 自动滚动` 放在接收区工具条
- 新增 **GPS 解析子界面**
  - 支持 `GPRMC / GNRMC / BDRMC`
  - 自动解析：
    - UTC时间
    - 日期
    - 状态
    - 纬度 / 经度
    - 十进制度坐标
    - 速度（knots / km/h）
    - 航向

## 推荐浏览器
- Chrome
- Edge

> Safari / Firefox 一般不支持 Web Serial API。

## 运行方式

### 方法1：直接打开
直接双击 `index.html`，部分环境可以直接运行。

### 方法2：本地 HTTP 服务
在当前目录执行：

```bash
python -m http.server 8080
```

浏览器打开：

```text
http://127.0.0.1:8080
```

## 使用说明

### 串口连接
1. 点击“连接串口”
2. 浏览器弹窗里选择串口
3. 在左侧设置参数
4. 开始收发数据

### 波特率
- 可直接在下拉框选常用波特率
- 也可在右侧输入框填写任意数值  
  例如：
  - `1000000`
  - `1500000`
  - `2000000`

### 发送
- 普通文本发送：直接输入文本
- HEX发送：勾选 `Hex发送` 后输入：
  ```text
  AA 55 01 02 0D 0A
  ```

### GPS解析
左侧勾选：
- `启用GPS解析`
- `显示解析子界面`

然后当接收到类似以下语句时会自动解析：
```text
$GNRMC,104532.00,A,3751.57570,N,11231.02435,E,0.044,,140917,,,A*65
$GPRMC,...
$BDRMC,...
```

## 快捷键
- `Ctrl + Enter` 或 `Cmd + Enter`：快速发送

## 文件说明
- `index.html`：主页面
- `styles.css`：样式文件
- `app.js`：串口逻辑与 GPS 解析逻辑
- `README.md`：说明文档

## 后续还可继续升级
- 自动发送
- 多串口标签页
- GGA / VTG / GSV / GSA 深度解析
- GPS轨迹地图
- 实时曲线
- 3D姿态显示


## 修改说明
接收区高度在 styles.css 中 .log-view 的 height 修改


## 新增：已连接状态下自动按新波特率重连
- 当串口已经连接时：
  - 修改下拉框波特率后，会自动断开并按新波特率重连
  - 修改自定义波特率后，按 Enter 或输入框失焦，也会自动断开并按新波特率重连

### 主要改动位置
在 `app.js` 中新增：
- `reopenPortWithCurrentSettings()`
- `setupAutoReconnectOnBaudChange()`

### 绑定的控件
- `els.baudRate`
- `els.customBaud`


## v14 修复
- 修复：已连接状态下改波特率时，会先完整断开，再按新波特率重连
- 修复：连接设置区域重复按钮，已删除底部那一组

### 删除的重复按钮块
在 `index.html` 里删除这一整段：
```html
<div class="btn-grid">
  <button id="connectBtn" class="btn primary">连接串口</button>
  <button id="disconnectBtn" class="btn">断开</button>
  <button id="reconnectBtn" class="btn">重连已授权</button>
</div>
```
