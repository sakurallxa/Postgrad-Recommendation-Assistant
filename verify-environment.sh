#!/bin/bash
# 保研信息助手小程序 - 开发环境验证脚本
# 使用说明: chmod +x verify-environment.sh && ./verify-environment.sh

echo "=========================================="
echo "保研信息助手 - 开发环境验证"
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

# 验证Node.js
verify_nodejs() {
    echo -e "${YELLOW}验证 Node.js...${NC}"
    if command_exists node; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✓ Node.js 已安装: $NODE_VERSION${NC}"
        
        if [[ "$NODE_VERSION" == v20.* ]]; then
            echo -e "${GREEN}✓ Node.js 版本符合要求 (20.x LTS)${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ Node.js 版本不符合要求，建议安装 20.x LTS${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ Node.js 未安装${NC}"
        return 1
    fi
}

# 验证npm
verify_npm() {
    echo -e "${YELLOW}验证 npm...${NC}"
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        echo -e "${GREEN}✓ npm 已安装: $NPM_VERSION${NC}"
        return 0
    else
        echo -e "${RED}✗ npm 未安装${NC}"
        return 1
    fi
}

# 验证Python
verify_python() {
    echo -e "${YELLOW}验证 Python...${NC}"
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version)
        echo -e "${GREEN}✓ Python 已安装: $PYTHON_VERSION${NC}"
        return 0
    else
        echo -e "${RED}✗ Python 未安装${NC}"
        return 1
    fi
}

# 验证pip
verify_pip() {
    echo -e "${YELLOW}验证 pip...${NC}"
    if command_exists pip3; then
        PIP_VERSION=$(pip3 --version)
        echo -e "${GREEN}✓ pip 已安装: $PIP_VERSION${NC}"
        return 0
    else
        echo -e "${RED}✗ pip 未安装${NC}"
        return 1
    fi
}

# 验证项目结构
verify_project_structure() {
    echo -e "${YELLOW}验证项目结构...${NC}"
    
    local all_good=true
    
    # 检查目录
    for dir in "backend" "crawler" "miniprogram"; do
        if [ -d "$dir" ]; then
            echo -e "${GREEN}✓ 目录存在: $dir${NC}"
        else
            echo -e "${RED}✗ 目录缺失: $dir${NC}"
            all_good=false
        fi
    done
    
    # 检查关键文件
    local files=(
        "backend/package.json"
        "backend/prisma/schema.prisma"
        "backend/.env.example"
        "crawler/requirements.txt"
        "crawler/scrapy.cfg"
    )
    
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            echo -e "${GREEN}✓ 文件存在: $file${NC}"
        else
            echo -e "${RED}✗ 文件缺失: $file${NC}"
            all_good=false
        fi
    done
    
    if $all_good; then
        return 0
    else
        return 1
    fi
}

# 验证后端依赖
verify_backend_deps() {
    echo -e "${YELLOW}验证后端依赖...${NC}"
    if [ -d "backend/node_modules" ]; then
        echo -e "${GREEN}✓ 后端依赖已安装${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ 后端依赖未安装，请运行: cd backend && npm install${NC}"
        return 1
    fi
}

# 验证爬虫依赖
verify_crawler_deps() {
    echo -e "${YELLOW}验证爬虫依赖...${NC}"
    if python3 -c "import scrapy" 2>/dev/null; then
        echo -e "${GREEN}✓ Scrapy 已安装${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Scrapy 未安装，请运行: cd crawler && pip3 install -r requirements.txt${NC}"
        return 1
    fi
}

# 验证Git
verify_git() {
    echo -e "${YELLOW}验证 Git...${NC}"
    if command_exists git; then
        GIT_VERSION=$(git --version)
        echo -e "${GREEN}✓ Git 已安装: $GIT_VERSION${NC}"
        return 0
    else
        echo -e "${RED}✗ Git 未安装${NC}"
        return 1
    fi
}

# 主函数
main() {
    local exit_code=0
    
    echo ""
    
    # 验证Node.js
    if ! verify_nodejs; then
        exit_code=1
    fi
    echo ""
    
    # 验证npm
    if ! verify_npm; then
        exit_code=1
    fi
    echo ""
    
    # 验证Python
    if ! verify_python; then
        exit_code=1
    fi
    echo ""
    
    # 验证pip
    if ! verify_pip; then
        exit_code=1
    fi
    echo ""
    
    # 验证Git
    if ! verify_git; then
        exit_code=1
    fi
    echo ""
    
    # 验证项目结构
    if ! verify_project_structure; then
        exit_code=1
    fi
    echo ""
    
    # 验证后端依赖
    if ! verify_backend_deps; then
        exit_code=1
    fi
    echo ""
    
    # 验证爬虫依赖
    if ! verify_crawler_deps; then
        exit_code=1
    fi
    echo ""
    
    # 总结
    echo "=========================================="
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓ 所有环境检查通过！${NC}"
        echo ""
        echo "下一步操作:"
        echo "1. 复制 backend/.env.example 为 backend/.env"
        echo "2. 配置数据库和API密钥"
        echo "3. 运行数据库迁移: cd backend && npx prisma migrate dev"
        echo "4. 启动开发服务器: cd backend && npm run start:dev"
    else
        echo -e "${YELLOW}⚠ 部分环境检查未通过，请根据提示进行修复${NC}"
        echo ""
        echo "修复建议:"
        echo "1. 运行 ./setup-environment.sh 自动安装缺失的依赖"
        echo "2. 或手动安装缺失的工具"
    fi
    echo "=========================================="
    
    return $exit_code
}

# 执行主函数
main
