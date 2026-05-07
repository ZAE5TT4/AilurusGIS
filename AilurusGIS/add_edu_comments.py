import os
import re

# объявление функции
def add_comments(filepath):
    # начало блока перехвата ошибок
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    # обработка ошибки
    except Exception as e:
        # возврат результата
        return
        
    new_lines = []
    
    # We will track if previous line was a comment to avoid duplicates
    
    # начало цикла
    for i, line in enumerate(lines):
        stripped = line.strip()
        indent = line[:len(line) - len(line.lstrip())]
        
        # Determine file type
        ext = os.path.splitext(filepath)[1]
        c_token = "#" if ext == ".py" else "//"
        
        # We want to add comments for:
        # function definitions
        # if conditions
        # for loops
        # try/catch
        
        added_comment = None
        
        # проверка условия
        if ext in ['.js', '.html']:
            # проверка условия
            if re.match(r'^(export\s+)?(async\s+)?function\s+\w+', stripped):
                added_comment = f"{indent}{c_token} объявление функции\n"
            elif stripped.startswith('try {') or stripped.startswith('try{'):
                added_comment = f"{indent}{c_token} начало блока перехвата ошибок\n"
            elif stripped.startswith('catch '):
                added_comment = f"{indent}{c_token} обработка ошибки\n"
            elif stripped.startswith('for ') or stripped.startswith('for('):
                added_comment = f"{indent}{c_token} начало цикла\n"
            elif stripped.startswith('if ') or stripped.startswith('if('):
                added_comment = f"{indent}{c_token} проверка условия\n"
            elif stripped.startswith('return ') or stripped.startswith('return;'):
                added_comment = f"{indent}{c_token} возврат результата\n"
        elif ext == '.py':
            # проверка условия
            if re.match(r'^(async\s+)?def\s+\w+', stripped):
                added_comment = f"{indent}{c_token} объявление функции\n"
            elif stripped.startswith('try:'):
                added_comment = f"{indent}{c_token} начало блока перехвата ошибок\n"
            elif stripped.startswith('except ') or stripped == 'except:':
                added_comment = f"{indent}{c_token} обработка ошибки\n"
            elif stripped.startswith('for '):
                added_comment = f"{indent}{c_token} начало цикла\n"
            elif stripped.startswith('if '):
                added_comment = f"{indent}{c_token} проверка условия\n"
            elif stripped.startswith('return ') or stripped == 'return':
                added_comment = f"{indent}{c_token} возврат результата\n"
                
        # To avoid duplicating comments if we already have one
        if added_comment:
            # check if previous line in new_lines is already this comment
            if len(new_lines) > 0 and new_lines[-1].strip() == added_comment.strip():
                pass
            # or if previous line is some comment
            elif len(new_lines) > 0 and new_lines[-1].strip().startswith(c_token):
                pass
            else:
                new_lines.append(added_comment)
                
        new_lines.append(line)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

# объявление функции
def main():
    root_dir = r"C:\git\AilurusGIS\AilurusGIS"
    exclude_dirs = {'Sprites', 'Cesium', '.vscode', 'DB', '__pycache__', 'Music'}
    
    # начало цикла
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        # начало цикла
        for file in files:
            # проверка условия
            if file.endswith(('.py', '.js')):
                filepath = os.path.join(root, file)
                add_comments(filepath)

# проверка условия
if __name__ == '__main__':
    main()
