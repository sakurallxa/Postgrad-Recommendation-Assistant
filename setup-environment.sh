#!/bin/bash
# 保研信息助手小程序 - 开发环境安装脚本
# 使用说明: chmod +x setup-environment.sh && ./setup-environment.sh

echo "=========================================="
echo "保研信息助手 - 开发环境安装脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 安装Homebrew
install_homebrew() {
    echo -e "${YELLOW}正在安装 Homebrew...${NC}"
    if command_exists brew; then
        echo -e "${GREEN}Homebrew 已安装: $(brew --version)${NC}"
    else
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        echo -e "${GREEN}Homebrew 安装完成${NC}"
    fi
}

# 安装Node.js 20 LTS
install_nodejs() {
    echo -e "${YELLOW}正在安装 Node.js 20 LTS...${NC}"
    if command_exists node; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}Node.js 已安装: $NODE_VERSION${NC}"
        if [[ "$NODE_VERSION" == v20.* ]]; then
            echo -e "${GREEN}Node.js 版本符合要求${NC}"
        else
            echo -e "${YELLOW}Node.js 版本不符合要求，正在升级...${NC}"
            if command_exists brew; then
                brew install node@20
                brew link node@20 --force
            fi
        fi
    else
        if command_exists brew; then
            brew install node@20
            brew link node@20 --force
        else
            echo -e "${RED}请先安装 Homebrew${NC}"
            exit 1
        fi
    fi
    
    # 验证安装
    if command_exists node; then
        echo -e "${GREEN}Node.js 安装成功: $(node --version)${NC}"
        echo -e "${GREEN}npm 版本: $(npm --version)${NC}"
    fi
}

# 安装Python 3.11
install_python() {
    echo -e "${YELLOW}正在安装 Python 3.11...${NC}"
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version)
        echo -e "${GREEN}Python 已安装: $PYTHON_VERSION${NC}"
    fi
    
    if command_exists brew; then
        brew install python@3.11
        echo -e "${GREEN}Python 3.11 安装完成${NC}"
    fi
    
    # 验证安装
    if command_exists python3.11; then
        echo -e "${GREEN}Python 3.11 安装成功: $(python3.11 --version)${NC}"
    fi
}

# 安装后端依赖
install_backend_deps() {
    echo -e "${YELLOW}正在安装后端依赖...${NC}"
    if [ -d "backend" ]; then
        cd backend
        if command_exists npm; then
            npm install
            echo -e "${GREEN}后端依赖安装完成${NC}"
        else
            echo -e "${RED}npm 未安装，请先安装 Node.js${NC}"
        fi
        cd ..
    fi
}

# 安装爬虫依赖
install_crawler_deps() {
    echo -e "${YELLOW}正在安装爬虫依赖...${NC}"
    if [ -d "crawler" ]; then
        cd crawler
        if command_exists pip3; then
            pip3 install -r requirements.txt
            echo -e "${GREEN}爬虫依赖安装完成${NC}"
        else
            echo -e "${RED}pip3 未安装${NC}"
        fi
        cd ..
    fi
}

# 初始化Prisma
init_prisma() {
    echo -e "${YELLOW}正在初始化 Prisma...${NC}"
    if [ -d "backend" ]; then
        cd backend
        if command_exists npx; then
            npx prisma generate
            echo -e "${GREEN}Prisma 客户端生成完成${NC}"
        fi
        cd ..
    fi
}

# 主函数
main() {
    echo "开始安装开发环境..."
    
    # 安装Homebrew
    install_homebrew
    
    # 安装Node.js
    install_nodejs
    
    # 安装Python
    install_python
    
    # 安装后端依赖
    install_backend_deps
    
    # 安装爬虫依赖
    install_crawler_deps
    
    # 初始化Prisma
    init_prisma
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}开发环境安装完成！${NC}"
    echo "=========================================="
    echo ""
    echo "请检查以下配置:"
    echo "1. 复制 backend/.env.example 为 backend/.env 并填写配置"
    echo "2. 配置数据库连接信息"
    echo "3. 配置微信小程序 AppID 和 Secret"
    echo "4. 配置 DeepSeek API Key"
    echo ""
}

# 执行主函数
main
