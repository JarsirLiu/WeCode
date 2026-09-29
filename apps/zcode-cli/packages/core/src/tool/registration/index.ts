// 内置工具装配公开入口。执行端口不在此处保存，仍由 ToolExecutionContext 逐次接收。
export {
  buildBuiltInToolRegistrationPlan,
  registerBuiltInTools,
} from "../handlers/index.js";
